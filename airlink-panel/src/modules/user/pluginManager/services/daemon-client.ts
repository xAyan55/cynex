import axios from 'axios';
import crypto from 'crypto';
import path from 'path';
import { daemonSchemeSync } from '../../../../handlers/utils/core/daemonRequest';
import { DaemonFileEntry } from '../types/modrinth-api';
import { PLUGIN_MANAGER_CONFIG } from '../config';

interface ServerWithNode {
  UUID: string;
  node: {
    address: string;
    port: number;
    key: string;
  };
}

export interface DaemonClientConfig {
  maxFileSize: number;
  downloadTimeout: number;
  requestTimeout: number;
}

const DEFAULT_CONFIG: DaemonClientConfig = {
  maxFileSize: PLUGIN_MANAGER_CONFIG.MAX_FILE_SIZE,
  downloadTimeout: 300000,
  requestTimeout: PLUGIN_MANAGER_CONFIG.REQUEST_TIMEOUT,
};

export class PluginDaemonClient {
  private readonly config: DaemonClientConfig;

  constructor(
    private readonly logger: { info: (message: string, ...args: unknown[]) => void; warn: (message: string, ...args: unknown[]) => void; error: (message: string, ...args: unknown[]) => void },
    config?: Partial<DaemonClientConfig>,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  sanitizeFilePath(filePath: string): string {
    if (!filePath?.trim()) return '';
    return path
      .normalize(filePath)
      .replace(/^(\.\.[\\/])+/, '')
      .replace(/[<>:"|?*]/g, '_')
      .replace(/\.\./g, '')
      .replace(/^\/+(?!\/)/, '');
  }

  private validateServer(server: ServerWithNode): void {
    if (!server?.node?.address || !server?.node?.port || !server?.node?.key || !server?.UUID) {
      throw new Error('Invalid server configuration');
    }
  }

  private baseUrl(server: ServerWithNode): string {
    return `${daemonSchemeSync()}://${server.node.address}:${server.node.port}`;
  }

  private auth(server: ServerWithNode) {
    return { username: 'CynexGP', password: server.node.key };
  }

  async isDaemonOnline(server: ServerWithNode): Promise<boolean> {
    try {
      await axios.get(`${this.baseUrl(server)}/`, {
        auth: this.auth(server),
        timeout: 5000,
      });
      return true;
    } catch {
      return false;
    }
  }

  async listDirectory(server: ServerWithNode, directoryPath: string): Promise<DaemonFileEntry[]> {
    this.validateServer(server);
    const sanitizedPath = this.sanitizeFilePath(directoryPath) || '/';
    const response = await axios.get(`${this.baseUrl(server)}/fs/list`, {
      auth: this.auth(server),
      params: { id: server.UUID, path: sanitizedPath },
      timeout: this.config.requestTimeout,
    });
    return Array.isArray(response.data) ? response.data as DaemonFileEntry[] : [];
  }

  async uploadFile(
    server: ServerWithNode,
    relativePath: string,
    fileName: string,
    fileBuffer: Buffer,
  ): Promise<void> {
    this.validateServer(server);
    if (!fileBuffer.length || !fileName.trim()) {
      throw new Error('Invalid file data');
    }

    const sanitizedPath = this.sanitizeFilePath(relativePath) || '/';
    const sanitizedFileName = this.sanitizeFilePath(fileName);
    if (!sanitizedFileName) throw new Error('Invalid file name');

    await axios.post(
      `${this.baseUrl(server)}/fs/upload`,
      {
        id: server.UUID,
        path: sanitizedPath,
        fileName: sanitizedFileName,
        fileContent: `data:application/octet-stream;base64,${fileBuffer.toString('base64')}`,
      },
      {
        auth: this.auth(server),
        headers: { 'Content-Type': 'application/json' },
        timeout: this.config.downloadTimeout,
        maxContentLength: this.config.maxFileSize * 2,
        maxBodyLength: this.config.maxFileSize * 2,
      },
    );
  }

  async deletePath(server: ServerWithNode, filePath: string): Promise<void> {
    this.validateServer(server);
    const sanitizedPath = this.sanitizeFilePath(filePath);
    if (!sanitizedPath) throw new Error('Invalid file path');

    await axios.delete(`${this.baseUrl(server)}/fs/rm`, {
      auth: this.auth(server),
      headers: { 'Content-Type': 'application/json' },
      data: { id: server.UUID, path: sanitizedPath },
      timeout: this.config.requestTimeout,
    });
  }

  async renamePath(server: ServerWithNode, fromPath: string, toPath: string): Promise<void> {
    this.validateServer(server);
    const sanitizedFrom = this.sanitizeFilePath(fromPath);
    const sanitizedTo = this.sanitizeFilePath(toPath);
    if (!sanitizedFrom || !sanitizedTo) throw new Error('Invalid rename path');

    await axios.post(
      `${this.baseUrl(server)}/fs/rename`,
      { id: server.UUID, from: sanitizedFrom, to: sanitizedTo },
      {
        auth: this.auth(server),
        headers: { 'Content-Type': 'application/json' },
        timeout: this.config.requestTimeout,
      },
    );
  }

  async createDirectory(server: ServerWithNode, directoryPath: string): Promise<void> {
    this.validateServer(server);
    const sanitizedPath = this.sanitizeFilePath(directoryPath);
    if (!sanitizedPath) throw new Error('Invalid directory path');

    const normalizedPath = sanitizedPath.endsWith('/') ? sanitizedPath : `${sanitizedPath}/`;
    await axios.post(
      `${this.baseUrl(server)}/fs/mkdir`,
      { id: server.UUID, path: normalizedPath },
      {
        auth: this.auth(server),
        headers: { 'Content-Type': 'application/json' },
        timeout: this.config.requestTimeout,
      },
    );
  }

  async createBackupZip(server: ServerWithNode, sourcePath: string, zipPath: string): Promise<void> {
    this.validateServer(server);
    await axios.post(
      `${this.baseUrl(server)}/fs/zip`,
      { id: server.UUID, path: this.sanitizeFilePath(sourcePath), zipPath: this.sanitizeFilePath(zipPath) },
      {
        auth: this.auth(server),
        headers: { 'Content-Type': 'application/json' },
        timeout: this.config.downloadTimeout,
      },
    );
  }

  validateHash(buffer: Buffer, expectedHash: string): boolean {
    try {
      const hashType = expectedHash.length === 64 ? 'sha256' : 'sha1';
      const hash = crypto.createHash(hashType).update(buffer).digest('hex');
      return hash.toLowerCase() === expectedHash.toLowerCase();
    } catch {
      return false;
    }
  }

  async downloadFile(url: string, filename: string, expectedHash?: string): Promise<Buffer> {
    if (!url || !filename) throw new Error('URL and filename required');

    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const response = await axios.get<ArrayBuffer>(url, {
          responseType: 'arraybuffer',
          headers: {
            'User-Agent': PLUGIN_MANAGER_CONFIG.USER_AGENT,
            Accept: '*/*',
          },
          timeout: this.config.downloadTimeout,
          maxContentLength: this.config.maxFileSize,
          maxBodyLength: this.config.maxFileSize,
        });

        const buffer = Buffer.from(response.data);
        if (!buffer.length) throw new Error('Empty file');

        if (expectedHash && !this.validateHash(buffer, expectedHash)) {
          throw new Error(`Hash validation failed for ${filename}`);
        }

        this.logger.info(`Downloaded ${filename}: ${buffer.length} bytes`);
        return buffer;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Download attempt ${attempt + 1} failed: ${message}`);
        if (attempt >= maxAttempts - 1) {
          throw new Error(`Download failed after ${maxAttempts} attempts: ${message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
      }
    }

    throw new Error(`Download failed for ${filename}`);
  }

  isValidJar(buffer: Buffer): boolean {
    if (buffer.length < 4) return false;
    return buffer[0] === 0x50 && buffer[1] === 0x4b;
  }
}
