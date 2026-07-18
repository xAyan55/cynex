import http from 'node:http';
import { existsSync } from 'node:fs';
import type { IncusTransport, RawResponse } from './IncusTransport';
import logger from '../../logger';

export class LocalSocketTransport implements IncusTransport {
  name = 'local_socket';
  private socketPath = '';

  private candidatePaths = [
    '/var/lib/incus/unix.socket',
    '/var/snap/lxd/common/lxd/unix.socket',
    '/var/lib/lxd/unix.socket',
  ];

  constructor() {
    this.detectSocket();
  }

  private detectSocket(): void {
    for (const path of this.candidatePaths) {
      if (existsSync(path)) {
        this.socketPath = path;
        logger.info(`LocalSocketTransport: detected socket at ${path}`);
        return;
      }
    }
  }

  async isAvailable(): Promise<boolean> {
    this.detectSocket();
    return this.socketPath !== '';
  }

  private request(method: string, path: string, body?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socketPath) {
        return reject(new Error('No Incus or LXD socket detected on this system.'));
      }

      const payload = body ? JSON.stringify(body) : '';
      const req = http.request(
        {
          socketPath: this.socketPath,
          method,
          path,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);
              if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(parsed.error || `HTTP ${res.statusCode}: ${data}`));
              } else {
                resolve(parsed);
              }
            } catch {
              if (res.statusCode && res.statusCode >= 400) {
                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
              } else {
                resolve(data);
              }
            }
          });
        }
      );

      req.on('error', (err) => {
        reject(err);
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  }

  async get(path: string): Promise<any> {
    return this.request('GET', path);
  }

  async post(path: string, body?: any): Promise<any> {
    return this.request('POST', path, body);
  }

  async put(path: string, body?: any): Promise<any> {
    return this.request('PUT', path, body);
  }

  async patch(path: string, body?: any): Promise<any> {
    return this.request('PATCH', path, body);
  }

  async delete(path: string, body?: any): Promise<any> {
    return this.request('DELETE', path, body);
  }

  async rawRequest(method: string, path: string, headers: Record<string, string> = {}, body?: string | Buffer): Promise<RawResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socketPath) {
        return reject(new Error('No Incus or LXD socket detected on this system.'));
      }

      const payload = body ? body : '';
      const reqHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...headers,
      };
      if (payload) {
        reqHeaders['Content-Length'] = String(Buffer.isBuffer(payload) ? payload.length : Buffer.byteLength(payload));
      }

      const req = http.request(
        {
          socketPath: this.socketPath,
          method,
          path,
          headers: reqHeaders,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            const responseHeaders: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) {
              if (v !== undefined) {
                responseHeaders[k] = Array.isArray(v) ? v.join(', ') : String(v);
              }
            }
            resolve({ status: res.statusCode ?? 500, headers: responseHeaders, body: data });
          });
        }
      );

      req.on('error', (err) => {
        reject(err);
      });

      if (payload) {
        if (Buffer.isBuffer(payload)) {
          req.write(payload);
        } else {
          req.write(payload);
        }
      }
      req.end();
    });
  }
}
