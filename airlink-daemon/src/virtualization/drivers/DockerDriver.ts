import type { VirtualizationDriver } from '../VirtualizationDriver';
import type {
  InstanceConfiguration,
  InstanceMetrics,
  ConsoleDriver,
  TerminalDriver,
  FilesystemDriver,
  FileEntry,
} from '../types';
import {
  docker,
  startContainer,
  stopContainer,
  killContainer,
  deleteContainerAndVolume,
  getContainerStats,
} from '../../handlers/docker';
import { Readable, Writable } from 'node:stream';
import logger from '../../logger';

class DockerConsoleDriver implements ConsoleDriver {
  private id: string;
  constructor(id: string) {
    this.id = id;
  }
  readBootLogs(): Readable {
    const readable = new Readable({ read() {} });
    const container = docker.getContainer(this.id);
    container.logs({ stdout: true, stderr: true, follow: true, tail: 100 }, (err, stream) => {
      if (err || !stream) {
        readable.push(null);
        return;
      }
      stream.on('data', (chunk) => {
        readable.push(chunk);
      });
      stream.on('end', () => {
        readable.push(null);
      });
    });
    return readable;
  }
}

class DockerTerminalDriver implements TerminalDriver {
  private id: string;
  constructor(id: string) {
    this.id = id;
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
    const container = docker.getContainer(this.id);
    const exec = await container.exec({
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Cmd: command,
      Env: env ? Object.entries(env).map(([k, v]) => `${k}=${v}`) : [],
    });

    const stream = await exec.start({ hijack: true, stdin: true });
    
    const stdin = new Writable({
      write(chunk, encoding, callback) {
        stream.write(chunk, encoding, callback);
      }
    });

    const stdout = new Readable({
      read() {
        stream.on('data', (chunk) => {
          this.push(chunk);
        });
        stream.on('end', () => {
          this.push(null);
        });
      }
    });

    return {
      stdin,
      stdout,
      resize(cols: number, rows: number) {
        exec.resize({ h: rows, w: cols }).catch(() => {});
      },
      kill() {
        // exec instance is terminated by closing the stream
        stream.end();
      }
    };
  }
}

class DockerFilesystemDriver implements FilesystemDriver {
  private id: string;
  constructor(id: string) {
    this.id = id;
  }
  async list(path: string): Promise<FileEntry[]> {
    return [];
  }
  async read(path: string): Promise<Readable> {
    const r = new Readable({ read() {} });
    r.push(null);
    return r;
  }
  async write(path: string, content: Buffer | string): Promise<void> {}
  async delete(path: string): Promise<void> {}
  async chmod(path: string, mode: number): Promise<void> {}
  async chown(path: string, uid: number, gid: number): Promise<void> {}
}

export class DockerDriver implements VirtualizationDriver {
  name = 'minecraft';

  async create(id: string, config: InstanceConfiguration): Promise<void> {
    logger.info(`DockerDriver: Creating container for "${id}"`);
    await startContainer(
      id,
      config.image,
      config.env || {},
      config.ports || '',
      config.limits.memory,
      config.limits.cpu
    );
  }

  async destroy(id: string): Promise<void> {
    logger.info(`DockerDriver: Destroying container and volumes for "${id}"`);
    await deleteContainerAndVolume(id);
  }

  async reinstall(id: string, image: string, config: InstanceConfiguration): Promise<void> {
    await this.destroy(id);
    await this.create(id, { ...config, image });
  }

  async start(id: string): Promise<void> {
    logger.info(`DockerDriver: Starting container "${id}"`);
    const container = docker.getContainer(id);
    await container.start();
  }

  async stop(id: string): Promise<void> {
    logger.info(`DockerDriver: Stopping container "${id}"`);
    await stopContainer(id, 'stop');
  }

  async restart(id: string): Promise<void> {
    logger.info(`DockerDriver: Restarting container "${id}"`);
    const container = docker.getContainer(id);
    await container.restart();
  }

  async suspend(id: string): Promise<void> {
    logger.info(`DockerDriver: Pausing container "${id}"`);
    const container = docker.getContainer(id);
    await container.pause();
  }

  async resume(id: string): Promise<void> {
    logger.info(`DockerDriver: Unpausing container "${id}"`);
    const container = docker.getContainer(id);
    await container.unpause();
  }

  async resize(id: string, limits: any): Promise<void> {
    logger.info(`DockerDriver: Resizing container "${id}"`, limits);
    const container = docker.getContainer(id);
    const updateOptions: any = {};
    if (limits.memory) {
      updateOptions.Memory = limits.memory * 1024 * 1024;
    }
    if (limits.cpu) {
      updateOptions.NanoCpus = Math.floor((limits.cpu / 100) * 1e9);
    }
    await container.update(updateOptions);
  }

  async rename(id: string, newName: string): Promise<void> {
    logger.info(`DockerDriver: Renaming container "${id}" to "${newName}"`);
    const container = docker.getContainer(id);
    await container.rename({ name: newName });
  }

  getConsole(id: string): ConsoleDriver {
    return new DockerConsoleDriver(id);
  }

  getTerminal(id: string): TerminalDriver {
    return new DockerTerminalDriver(id);
  }

  getFilesystem(id: string): FilesystemDriver {
    return new DockerFilesystemDriver(id);
  }

  async getMetrics(id: string): Promise<InstanceMetrics> {
    const stats = await getContainerStats(id);
    if (!stats) {
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

    return {
      running: stats.running,
      cpuPercentage: stats.cpu.percentage,
      memoryUsageBytes: stats.memory.usage,
      memoryLimitBytes: stats.memory.limit,
      storageUsageBytes: stats.storage.usage * 1024 * 1024,
      storageLimitBytes: 0,
      networkRxBytes: 0,
      networkTxBytes: 0,
      uptimeSeconds: 0, // Docker status tracking required for uptime
    };
  }
}
