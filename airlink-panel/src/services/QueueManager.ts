import prisma from '../db';
import logger from '../handlers/logger';
import { queueer } from '../handlers/queueer';
import axios from 'axios';
import { daemonSchemeSync } from '../handlers/utils/core/daemonRequest';

export class QueueManager {
  /**
   * Gets the position of a server in the active deployment queue.
   * Rank is determined by sorting servers with Queued=true by creation date.
   */
  static async getQueuePosition(serverUuid: string): Promise<number> {
    try {
      const server = await prisma.server.findUnique({
        where: { UUID: serverUuid },
      });

      if (!server || !server.Queued) {
        return 0; // Not in queue
      }

      // Count how many queued servers were created before this one
      const countAhead = await prisma.server.count({
        where: {
          Queued: true,
          createdAt: {
            lt: server.createdAt,
          },
        },
      });

      return countAhead + 1; // 1-indexed queue position
    } catch (error) {
      logger.error(`QueueManager: Failed to get queue position for ${serverUuid}`, error);
      return 0;
    }
  }

  /**
   * Gets the total count of servers currently waiting in the queue.
   */
  static async getQueueStats(): Promise<{ totalQueued: number }> {
    try {
      const totalQueued = await prisma.server.count({
        where: { Queued: true },
      });
      return { totalQueued };
    } catch (error) {
      logger.error('QueueManager: Failed to get queue stats', error);
      return { totalQueued: 0 };
    }
  }

  /**
   * Adds the server to the serial task queueer and fires off the installation API call.
   */
  static triggerDeployment(serverUuid: string, assignedPorts: number[]): void {
    queueer.addTask(async () => {
      try {
        const server = await prisma.server.findUnique({
          where: { UUID: serverUuid },
          include: { image: true, node: true },
        });

        if (!server || !server.Queued) return;

        const daemonUrl = `${daemonSchemeSync()}://${server.node.address}:${server.node.port}`;

        // ── LXC / VPS deployment path ──────────────────────────────────
        if (server.instanceType === 'LXC') {
          await axios.post(
            `${daemonUrl}/container/install`,
            {
              id: server.UUID,
              instanceType: 'LXC',
              image: server.osTemplate || 'ubuntu/24.04',
              limits: {
                memory: server.Memory,
                cpu: server.Cpu,
                storage: server.Storage,
                swap: server.swap || 0,
                bandwidth: server.bandwidth || 0,
              },
              network: { type: 'bridged' },
              storage: { size: server.Storage },
              cloudInit: server.rootPassword
                ? { hostname: server.UUID, rootPassword: server.rootPassword }
                : { hostname: server.UUID },
              security: { privileged: false },
              env: {},
            },
            {
              auth: { username: 'CynexGP', password: server.node.key },
              headers: { 'Content-Type': 'application/json' },
              timeout: 600000,
            },
          );

          await prisma.server.update({
            where: { id: server.id },
            data: { Queued: false, Installing: false },
          });
          return;
        }

        // ── Minecraft / Docker deployment path (unchanged) ─────────────
        if (!server.Variables) {
          await prisma.server.update({ where: { id: server.id }, data: { Queued: false } });
          return;
        }

        let serverEnv: any[];
        try {
          const rawVars = JSON.parse(server.Variables);
          serverEnv = rawVars.map((v: any) => ({
            env: String(v.env_variable ?? v.env ?? ''),
            value: v.value ?? v.default_value ?? '',
          }));
          const serverPort = assignedPorts[0] || 25565;
          serverEnv.push({ env: 'SERVER_PORT', value: serverPort });
          serverEnv.push({ env: 'SERVER_MEMORY', value: String(server.Memory) });
          serverEnv.push({ env: 'SERVER_CPU', value: String(server.Cpu) });
        } catch (err) {
          logger.error(`QueueManager: Error parsing Variables for server ${server.id}:`, err);
          await prisma.server.update({ where: { id: server.id }, data: { Queued: false } });
          return;
        }

        const env = serverEnv.reduce((acc: any, curr: any) => {
          acc[curr.env] = curr.value;
          return acc;
        }, {});

        if (!server.image?.scripts) {
          await prisma.server.update({ where: { id: server.id }, data: { Queued: false } });
          return;
        }

        let scripts: Record<string, unknown>;
        try {
          scripts = JSON.parse(server.image.scripts);
        } catch (err) {
          logger.error(`QueueManager: Error parsing scripts for server ${server.id}:`, err);
          await prisma.server.update({ where: { id: server.id }, data: { Queued: false } });
          return;
        }

        if (scripts.installation && typeof scripts.installation === 'object') {
          const inst = scripts.installation as { script: string; container: string; entrypoint: string };
          await axios.post(
            `${daemonUrl}/container/installer`,
            { id: server.UUID, script: inst.script, container: inst.container, entrypoint: inst.entrypoint || 'bash', env },
            {
              auth: { username: 'CynexGP', password: server.node.key },
              headers: { 'Content-Type': 'application/json' },
              timeout: 600000,
            },
          );
        } else if (Array.isArray(scripts.install)) {
          let dockerImageValue: string | undefined;
          try {
            const parsed = JSON.parse(server.dockerImage || '{}');
            dockerImageValue = Object.values(parsed)[0] as string | undefined;
          } catch { /* leave undefined */ }

          await axios.post(
            `${daemonUrl}/container/install`,
            {
              id: server.UUID,
              image: dockerImageValue,
              env,
              scripts: (scripts.install as any[]).map((s: any) => ({
                url: s.url,
                onStartup: s.onStart,
                ALVKT: s.ALVKT,
                fileName: s.fileName,
              })),
            },
            {
              auth: { username: 'CynexGP', password: server.node.key },
              headers: { 'Content-Type': 'application/json' },
              timeout: 600000,
            },
          );
        }

        // Set Queued = false and Installing = false upon successful daemon transfer
        await prisma.server.update({
          where: { id: server.id },
          data: { Queued: false, Installing: false },
        });

      } catch (err) {
        logger.error(`QueueManager: Failed deployment task for ${serverUuid}:`, err);
      }
    });
  }
}
