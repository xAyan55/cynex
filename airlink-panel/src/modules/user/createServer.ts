import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { ServerProvisioner } from '../../services/ServerProvisioner';
import { queueer } from '../../handlers/queueer';
import axios from 'axios';
import { daemonSchemeSync } from '../../handlers/utils/core/daemonRequest';
import {
  getUsedExternalPorts,
  parseImagePortRequirements,
  serializeServerPorts,
} from '../../handlers/utils/server/ports';

function pickAvailablePorts(allocatedPorts: number[], usedPorts: number[], count: number): number[] {
  const picked: number[] = [];
  for (const port of allocatedPorts) {
    if (!usedPorts.includes(port)) picked.push(port);
    if (picked.length === count) return picked;
  }
  return picked;
}

async function resolveUserServerLimit(userId: number, settings: any): Promise<number> {
  const user = await prisma.users.findUnique({ where: { id: userId } });
  if (!user) return 0;
  if (user.serverLimit !== null && user.serverLimit !== undefined) return user.serverLimit;
  return settings?.defaultServerLimit ?? 0;
}

async function resolveUserResourceLimits(userId: number, settings: any) {
  const user = await prisma.users.findUnique({ where: { id: userId } });
  return {
    maxMemory: user?.maxMemory ?? settings?.defaultMaxMemory ?? 512,
    maxCpu: user?.maxCpu ?? settings?.defaultMaxCpu ?? 100,
    maxStorage: user?.maxStorage ?? settings?.defaultMaxStorage ?? 5120,
  };
}

const userCreateServerModule: Module = {
  info: {
    name: 'User Create Server Module',
    description: 'Allows users to create their own servers within admin-defined limits.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'CynexGP',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get('/create-server', isAuthenticated(), async (req: Request, res: Response) => {
      try {
        const userId = req.session?.user?.id;
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) return res.redirect('/login');

        const settings = await prisma.settings.findUnique({ where: { id: 1 } });

        if (!settings?.allowUserCreateServer) {
          return res.redirect('/');
        }

        const serverLimit = await resolveUserServerLimit(userId!, settings);
        if (serverLimit === 0) {
          return res.redirect('/');
        }

        const currentCount = await prisma.server.count({ where: { ownerId: userId } });
        if (currentCount >= serverLimit) {
          return res.redirect('/?err=SERVER_LIMIT_REACHED');
        }

        const resourceLimits = await resolveUserResourceLimits(userId!, settings);
        const nodes = await prisma.node.findMany();
        const images = await prisma.images.findMany();

        res.render('user/create-server', {
          user,
          req,
          settings,
          nodes,
          images,
          serverLimit,
          currentCount,
          resourceLimits,
        });
      } catch (error) {
        logger.error('Error loading user create server page:', error);
        return res.redirect('/');
      }
    });

    router.post('/create-server', isAuthenticated(), async (req: Request, res: Response) => {
      try {
        const userId = req.session?.user?.id;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        if (!settings?.allowUserCreateServer) {
          return res.status(403).json({ error: 'Server creation is not enabled.' });
        }

        const serverLimit = await resolveUserServerLimit(userId, settings);
        if (serverLimit === 0) {
          return res.status(403).json({ error: 'You are not allowed to create servers.' });
        }

        const currentCount = await prisma.server.count({ where: { ownerId: userId } });
        if (currentCount >= serverLimit) {
          return res.status(403).json({ error: `You have reached your server limit of ${serverLimit}.` });
        }

        const { name, description, nodeId, imageId, dockerImage, Memory, Cpu, Storage, planType } = req.body;

        if (!name || !imageId || !dockerImage) {
          return res.status(400).json({ error: 'Missing required fields.' });
        }

        const server = await ServerProvisioner.provisionServer(userId, {
          name,
          description,
          nodeId: nodeId ? parseInt(nodeId) : undefined,
          imageId: parseInt(imageId),
          dockerImage,
          planType: planType === 'premium' ? 'premium' : 'free',
          memory: Memory ? parseInt(Memory) : undefined,
          cpu: Cpu ? parseInt(Cpu) : undefined,
          storage: Storage ? parseInt(Storage) : undefined,
        });

        res.status(200).json({ success: true, serverUUID: server.UUID });
      } catch (error: any) {
        logger.error('Error creating user server:', error);
        res.status(500).json({ error: error.message || 'Failed to create server.' });
      }
    });

    router.delete('/user/server/:uuid', isAuthenticated(), async (req: Request, res: Response) => {
      try {
        const userId = req.session?.user?.id;
        const user = await prisma.users.findUnique({ where: { id: userId } });
        if (!user) return res.status(401).json({ error: 'Unauthorized' });

        const settings = await prisma.settings.findUnique({ where: { id: 1 } });
        if (!settings?.allowUserDeleteServer) {
          return res.status(403).json({ error: 'Server deletion is not enabled for users.' });
        }

        const server = await prisma.server.findUnique({
          where: { UUID: String(req.params.uuid) },
          include: { node: true },
        });

        if (!server) return res.status(404).json({ error: 'Server not found.' });
        if (server.ownerId !== userId) return res.status(403).json({ error: 'This is not your server.' });

        const force = req.query.force === 'true';

        if (!force) {
          try {
            await axios.delete(`${daemonSchemeSync()}://${server.node.address}:${server.node.port}/container`, {
              auth: { username: 'CynexGP', password: server.node.key },
              headers: { 'Content-Type': 'application/json' },
              data: { id: server.UUID },
            });
          } catch (err: any) {
            const isGone =
              err.response?.status === 404 ||
              err.response?.data?.error?.includes('not exist');

            if (!isGone) {
              logger.error('Error deleting container from daemon:', err);
              return res.status(502).json({
                error: 'Could not delete the server on the node. Try again, or use force delete to remove it from the panel only.',
              });
            }
          }
        }

        await prisma.server.delete({ where: { UUID: server.UUID } });
        res.json({ success: true });
      } catch (error) {
        logger.error('Error deleting user server:', error);
        res.status(500).json({ error: 'Failed to delete server.' });
      }
    });

    return router;
  },
};

export default userCreateServerModule;
