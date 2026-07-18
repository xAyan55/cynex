import type { VirtualizationDriver } from '../VirtualizationDriver';
import type { IncusTransport } from '../transports/IncusTransport';
import { LocalSocketTransport } from '../transports/LocalSocketTransport';
import { CLICompatibilityTransport } from '../transports/CLICompatibilityTransport';
import type {
  InstanceConfiguration,
  InstanceMetrics,
  ConsoleDriver,
  TerminalDriver,
  FilesystemDriver,
  FileEntry,
} from '../types';
import { Readable, Writable } from 'node:stream';
import logger from '../../logger';

class IncusConsoleDriver implements ConsoleDriver {
  private id: string;
  private transport: IncusTransport;

  constructor(id: string, transport: IncusTransport) {
    this.id = id;
    this.transport = transport;
  }

  readBootLogs(): Readable {
    const stream = new Readable({ read() {} });
    // Fetch console log from Incus instance
    this.transport.get(`/1.0/instances/${this.id}/logs`).then((logList: any) => {
      const logs = logList?.metadata || [];
      const latestLog = Array.isArray(logs)
        ? logs.sort((a: string, b: string) => b.localeCompare(a))[0]
        : null;
      if (latestLog) {
        return this.transport.get(`/1.0/instances/${this.id}/logs/${latestLog}`);
      }
      return this.transport.get(`/1.0/instances/${this.id}/console`);
    }).then((data: any) => {
      const content = typeof data === 'string' ? data : data?.metadata || '';
      stream.push(content);
      stream.push(null);
    }).catch((err) => {
      stream.push(`Error reading boot logs: ${err instanceof Error ? err.message : 'Unknown error'}\n`);
      stream.push(null);
    });
    return stream;
  }
}

class IncusTerminalDriver implements TerminalDriver {
  private id: string;
  private transport: IncusTransport;

  constructor(id: string, transport: IncusTransport) {
    this.id = id;
    this.transport = transport;
  }

  async execInteractive(
    command: string[],
    env?: Record<string, string>
  ): Promise<{
    stdin: Writable;
    stdout: Readable;
    resize(cols: number, rows: number): void;
    kill(): void;
  }> {
    const execPayload: Record<string, any> = {
      command,
      environment: env || {},
      'wait-for-websocket': false,
      interactive: true,
      width: 80,
      height: 24,
    };

    const response = await this.transport.post(`/1.0/instances/${this.id}/exec`, execPayload);
    const operation = response?.metadata;
    const wsUrls = operation?.metadata?.ws || [];

    const stdin = new Writable({ write(chunk, encoding, callback) { callback(); } });
    const stdout = new Readable({ read() {} });
    stdout.push('Terminal session requested. WebSocket connection required for interactive use.\n');

    return {
      stdin,
      stdout,
      resize(cols: number, rows: number) {},
      kill() {},
    };
  }
}

class IncusFilesystemDriver implements FilesystemDriver {
  private id: string;
  private transport: IncusTransport;

  constructor(id: string, transport: IncusTransport) {
    this.id = id;
    this.transport = transport;
  }

  async list(path: string): Promise<FileEntry[]> {
    const res = await this.transport.rawRequest('GET', `/1.0/instances/${this.id}/files?path=${encodeURIComponent(path)}`, {
      'X-LXD-type': 'directory',
    });
    if (res.status >= 400) {
      throw new Error(`Failed to list directory: ${res.body}`);
    }
    try {
      const entries = JSON.parse(res.body);
      if (Array.isArray(entries)) {
        return entries.map((e: any) => ({
          name: e.name || e.basename || '',
          path: e.path || `${path.replace(/\/$/, '')}/${e.name || ''}`,
          isDirectory: e.type === 'directory',
          size: e.size || 0,
          mtime: e.last_modified ? new Date(e.last_modified) : new Date(),
          mode: e.mode ? parseInt(String(e.mode), 8) : 0o755,
        }));
      }
    } catch {
      // fallback: parse raw output
    }
    return [];
  }

  async read(path: string): Promise<Readable> {
    const res = await this.transport.rawRequest('GET', `/1.0/instances/${this.id}/files?path=${encodeURIComponent(path)}`);
    const stream = new Readable({ read() {} });
    if (res.status < 400) {
      stream.push(Buffer.from(res.body, 'binary'));
    }
    stream.push(null);
    return stream;
  }

  async write(path: string, content: Buffer | string): Promise<void> {
    await this.transport.rawRequest(
      'POST',
      `/1.0/instances/${this.id}/files?path=${encodeURIComponent(path)}`,
      {
        'X-LXD-type': 'file',
        'X-LXD-mode': '0644',
        'Content-Type': 'application/octet-stream',
      },
      typeof content === 'string' ? Buffer.from(content, 'utf-8') : content
    );
  }

  async delete(path: string): Promise<void> {
    const res = await this.transport.rawRequest('DELETE', `/1.0/instances/${this.id}/files?path=${encodeURIComponent(path)}`);
    if (res.status >= 400) {
      throw new Error(`Failed to delete path: ${res.body}`);
    }
  }

  async chmod(path: string, mode: number): Promise<void> {
    // Read existing file and re-upload with new mode
    const content = await this.readRaw(path);
    await this.transport.rawRequest(
      'POST',
      `/1.0/instances/${this.id}/files?path=${encodeURIComponent(path)}`,
      {
        'X-LXD-type': 'file',
        'X-LXD-mode': mode.toString(8),
        'Content-Type': 'application/octet-stream',
      },
      content
    );
  }

  async chown(path: string, uid: number, gid: number): Promise<void> {
    const content = await this.readRaw(path);
    await this.transport.rawRequest(
      'POST',
      `/1.0/instances/${this.id}/files?path=${encodeURIComponent(path)}`,
      {
        'X-LXD-type': 'file',
        'X-LXD-mode': '0644',
        'X-LXD-uid': String(uid),
        'X-LXD-gid': String(gid),
        'Content-Type': 'application/octet-stream',
      },
      content
    );
  }

  private async readRaw(path: string): Promise<Buffer> {
    const res = await this.transport.rawRequest('GET', `/1.0/instances/${this.id}/files?path=${encodeURIComponent(path)}`);
    if (res.status >= 400) {
      throw new Error(`Failed to read file: ${res.body}`);
    }
    return Buffer.from(res.body, 'binary');
  }
}

export class IncusDriver implements VirtualizationDriver {
  name = 'lxc';
  private transport!: IncusTransport;
  private isInitialized = false;

  constructor() {
    this.initTransport();
  }

  private async initTransport(): Promise<void> {
    try {
      const local = new LocalSocketTransport();
      if (await local.isAvailable()) {
        this.transport = local;
        this.isInitialized = true;
        return;
      }
      const cli = new CLICompatibilityTransport();
      if (await cli.isAvailable()) {
        this.transport = cli;
        this.isInitialized = true;
        return;
      }
      // fallback
      this.transport = local;
    } catch (err) {
      logger.error('IncusDriver: Failed to initialize transport layer', err);
    }
  }

  private async ensureTransport(): Promise<void> {
    if (!this.isInitialized) {
      await this.initTransport();
    }
  }

  async create(id: string, config: InstanceConfiguration): Promise<void> {
    await this.ensureTransport();
    logger.info(`IncusDriver: Creating instance "${id}"`);

    const imageAlias = config.image || 'ubuntu/24.04';
    const payload = {
      name: id,
      source: {
        type: 'image',
        mode: 'pull',
        server: 'https://images.linuxcontainers.org',
        protocol: 'simplestreams',
        alias: imageAlias,
      },
      config: {
        'limits.cpu': String(config.limits.cpu),
        'limits.memory': `${config.limits.memory}MB`,
        'limits.memory.swap': config.limits.swap ? 'true' : 'false',
        ...(config.limits.swap ? { 'limits.memory.swap.size': `${config.limits.swap}MB` } : {}),
      } as Record<string, string>,
      type: 'container',
    };

    if (config.cloudInit) {
      const yaml = [
        '#cloud-config',
        `hostname: ${config.cloudInit.hostname || id}`,
      ];
      if (config.cloudInit.rootPassword) {
        yaml.push(`chpasswd: { list: "root:${config.cloudInit.rootPassword}", expire: False }`);
      }
      if (config.cloudInit.sshKeys && config.cloudInit.sshKeys.length > 0) {
        yaml.push('ssh_authorized_keys:');
        for (const key of config.cloudInit.sshKeys) {
          yaml.push(`  - "${key}"`);
        }
      }
      payload.config['user.user-data'] = yaml.join('\n');
    }

    await this.transport.post('/1.0/instances', payload);
  }

  async destroy(id: string): Promise<void> {
    await this.ensureTransport();
    logger.info(`IncusDriver: Destroying instance "${id}"`);
    try {
      await this.stop(id);
    } catch {
      // ignore stop failures if already stopped
    }
    await this.transport.delete(`/1.0/instances/${id}`);
  }

  async reinstall(id: string, image: string, config: InstanceConfiguration): Promise<void> {
    await this.destroy(id);
    await this.create(id, { ...config, image });
  }

  private async setInstanceState(id: string, action: string): Promise<void> {
    await this.ensureTransport();
    await this.transport.put(`/1.0/instances/${id}/state`, {
      action,
      timeout: 30,
      force: true,
    });
  }

  async start(id: string): Promise<void> {
    logger.info(`IncusDriver: Starting instance "${id}"`);
    await this.setInstanceState(id, 'start');
  }

  async stop(id: string): Promise<void> {
    logger.info(`IncusDriver: Stopping instance "${id}"`);
    await this.setInstanceState(id, 'stop');
  }

  async restart(id: string): Promise<void> {
    logger.info(`IncusDriver: Restarting instance "${id}"`);
    await this.setInstanceState(id, 'restart');
  }

  async suspend(id: string): Promise<void> {
    logger.info(`IncusDriver: Suspending instance "${id}"`);
    await this.setInstanceState(id, 'freeze');
  }

  async resume(id: string): Promise<void> {
    logger.info(`IncusDriver: Resuming instance "${id}"`);
    await this.setInstanceState(id, 'unfreeze');
  }

  async resize(id: string, limits: any): Promise<void> {
    await this.ensureTransport();
    logger.info(`IncusDriver: Resizing instance "${id}"`, limits);
    const updateConfig: Record<string, string> = {};
    if (limits.cpu) {
      updateConfig['limits.cpu'] = String(limits.cpu);
    }
    if (limits.memory) {
      updateConfig['limits.memory'] = `${limits.memory}MB`;
    }
    if (limits.swap) {
      updateConfig['limits.memory.swap'] = 'true';
      updateConfig['limits.memory.swap.size'] = `${limits.swap}MB`;
    }
    await this.transport.patch(`/1.0/instances/${id}`, {
      config: updateConfig,
    });
  }

  async rename(id: string, newName: string): Promise<void> {
    await this.ensureTransport();
    logger.info(`IncusDriver: Renaming instance "${id}" to "${newName}"`);
    await this.transport.post(`/1.0/instances/${id}`, {
      name: newName,
    });
  }

  getConsole(id: string): ConsoleDriver {
    return new IncusConsoleDriver(id, this.transport);
  }

  getTerminal(id: string): TerminalDriver {
    return new IncusTerminalDriver(id, this.transport);
  }

  getFilesystem(id: string): FilesystemDriver {
    return new IncusFilesystemDriver(id, this.transport);
  }

  async getMetrics(id: string): Promise<InstanceMetrics> {
    await this.ensureTransport();
    try {
      const state = await this.transport.get(`/1.0/instances/${id}/state`);
      const status = state?.metadata;
      const isRunning = status?.status === 'Running';
      if (!isRunning) {
        return {
          running: false,
          cpuPercentage: 0,
          memoryUsageBytes: 0,
          memoryLimitBytes: 0,
          storageUsageBytes: 0,
          storageLimitBytes: 0,
          networkRxBytes: 0,
          networkTxBytes: 0,
          uptimeSeconds: 0,
        };
      }

      const memUsage = status?.memory?.usage || 0;
      const memLimit = status?.memory?.usage_peak || 0;
      const cpuUsage = status?.cpu?.usage || 0;

      // Network metrics
      const networks = status?.network || {};
      let networkRx = 0;
      let networkTx = 0;
      for (const iface of Object.values(networks) as any[]) {
        networkRx += iface?.counters?.bytes_received || 0;
        networkTx += iface?.counters?.bytes_sent || 0;
      }

      // Storage metrics - query instance info for disk usage
      let storageUsage = 0;
      let storageLimit = 0;
      try {
        const instanceInfo = await this.transport.get(`/1.0/instances/${id}`);
        const expConfig = instanceInfo?.metadata?.expanded_config || {};
        const devConfig = instanceInfo?.metadata?.expanded_devices || {};
        // Try root disk device first
        const rootDev = devConfig?.root || {};
        storageLimit = (parseInt(rootDev?.size || '0', 10)) * 1024 * 1024; // MB -> bytes
        if (!storageLimit) {
          const sizeStr = expConfig?.['limits.disk'] || '0';
          storageLimit = parseInt(sizeStr, 10) * 1024 * 1024;
        }
        // State provides disk usage
        storageUsage = status?.disk?.root?.usage || 0;
      } catch {
        // Storage query non-critical
      }

      // CPU percentage calculation
      const cpuSeconds = cpuUsage > 0 ? cpuUsage / 1e9 : 0;

      return {
        running: true,
        cpuPercentage: cpuSeconds,
        memoryUsageBytes: memUsage,
        memoryLimitBytes: memLimit,
        storageUsageBytes: storageUsage,
        storageLimitBytes: storageLimit,
        networkRxBytes: networkRx,
        networkTxBytes: networkTx,
        uptimeSeconds: parseInt(status?.uptime || '0', 10),
      };
    } catch {
      return {
        running: false,
        cpuPercentage: 0,
        memoryUsageBytes: 0,
        memoryLimitBytes: 0,
        storageUsageBytes: 0,
        storageLimitBytes: 0,
        networkRxBytes: 0,
        networkTxBytes: 0,
        uptimeSeconds: 0,
      };
    }
  }
}
