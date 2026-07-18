import type { IncusTransport, RawResponse } from './IncusTransport';
import logger from '../../logger';

export class CLICompatibilityTransport implements IncusTransport {
  name = 'cli_compatibility';
  private cliBinary = '';

  private async detectCli(): Promise<void> {
    if (this.cliBinary) return;
    for (const bin of ['incus', 'lxc']) {
      try {
        const proc = Bun.spawn([bin, '--version'], { stdout: 'ignore', stderr: 'ignore' });
        const code = await proc.exited;
        if (code === 0) {
          this.cliBinary = bin;
          logger.info(`CLICompatibilityTransport: detected CLI binary as "${bin}"`);
          return;
        }
      } catch {
        // binary not found
      }
    }
  }

  async isAvailable(): Promise<boolean> {
    await this.detectCli();
    return this.cliBinary !== '';
  }

  private async run(args: string[]): Promise<string> {
    await this.detectCli();
    if (!this.cliBinary) {
      throw new Error('No Incus or LXC CLI tool detected.');
    }

    const proc = Bun.spawn([this.cliBinary, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();

    if (exitCode !== 0) {
      throw new Error(`CLI command "${this.cliBinary} ${args.join(' ')}" failed with exit code ${exitCode}: ${stderr}`);
    }

    return stdout;
  }

  async get(path: string): Promise<any> {
    // Map REST GET paths to CLI commands
    if (path.startsWith('/1.0/instances')) {
      const output = await this.run(['list', '--format=json']);
      return JSON.parse(output);
    }
    if (path.startsWith('/1.0/images')) {
      const output = await this.run(['image', 'list', '--format=json']);
      return JSON.parse(output);
    }
    throw new Error(`CLI compatibility mapping for GET ${path} not implemented.`);
  }

  async post(path: string, body?: any): Promise<any> {
    // Map REST POST paths to CLI commands
    if (path.startsWith('/1.0/instances')) {
      const { name, source, config } = body;
      const args = ['launch', source.alias || source.fingerprint, name];
      if (config) {
        for (const [k, v] of Object.entries(config)) {
          args.push('-c', `${k}=${v}`);
        }
      }
      await this.run(args);
      return { type: 'sync', status: 'Success', status_code: 200 };
    }
    throw new Error(`CLI compatibility mapping for POST ${path} not implemented.`);
  }

  async put(path: string, body?: any): Promise<any> {
    throw new Error(`CLI compatibility mapping for PUT ${path} not implemented.`);
  }

  async patch(path: string, body?: any): Promise<any> {
    throw new Error(`CLI compatibility mapping for PATCH ${path} not implemented.`);
  }

  async delete(path: string, body?: any): Promise<any> {
    if (path.startsWith('/1.0/instances/')) {
      const parts = path.split('/');
      const name = parts[parts.length - 1];
      await this.run(['delete', name, '--force']);
      return { type: 'sync', status: 'Success', status_code: 200 };
    }
    throw new Error(`CLI compatibility mapping for DELETE ${path} not implemented.`);
  }

  async rawRequest(method: string, path: string, headers?: Record<string, string>, body?: string | Buffer): Promise<RawResponse> {
    throw new Error(`CLI compatibility does not support raw requests for ${method} ${path}. Use the local socket transport.`);
  }
}
