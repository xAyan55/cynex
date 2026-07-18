import type { Readable, Writable } from 'node:stream';

export interface ResourceProfile {
  memory: number; // in MB
  cpu: number;    // cores or percentage (e.g., 2 cores, or 200%)
  storage: number;// in MB
  swap?: number;  // in MB
  bandwidth?: number; // in MB/s
}

export interface NetworkConfiguration {
  type: 'bridged' | 'nat' | 'isolated' | 'routed' | 'macvlan' | 'ipvlan';
  bridge?: string;
  ipv4?: string;
  ipv6?: string;
  gateway?: string;
}

export interface StorageConfiguration {
  pool?: string;
  size: number; // in MB
}

export interface CloudInitConfiguration {
  hostname?: string;
  sshKeys?: string[];
  rootPassword?: string;
  users?: { username: string; password?: string; sshKeys?: string[] }[];
  packages?: string[];
  timezone?: string;
  locale?: string;
  dns?: string[];
  startupCommands?: string[];
}

export interface SecuritySettings {
  privileged?: boolean;
  nesting?: boolean;
}

export interface InstanceConfiguration {
  id: string;
  hostname: string;
  image: string;
  limits: ResourceProfile;
  network: NetworkConfiguration;
  storage: StorageConfiguration;
  cloudInit?: CloudInitConfiguration;
  security: SecuritySettings;
  env?: Record<string, string>;
  ports?: string; // Docker backward compatibility
}

export interface InstanceMetrics {
  running: boolean;
  cpuPercentage: number;
  memoryUsageBytes: number;
  memoryLimitBytes: number;
  storageUsageBytes: number;
  storageLimitBytes: number;
  networkRxBytes: number;
  networkTxBytes: number;
  uptimeSeconds: number;
}

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  mtime: Date;
  mode: number;
}

export interface ConsoleDriver {
  readBootLogs(): Readable;
}

export interface TerminalDriver {
  execInteractive(
    command: string[],
    env?: Record<string, string>
  ): Promise<{
    stdin: Writable;
    stdout: Readable;
    resize(cols: number, rows: number): void;
    kill(): void;
  }>;
}

export interface FilesystemDriver {
  list(path: string): Promise<FileEntry[]>;
  read(path: string): Promise<Readable>;
  write(path: string, content: Buffer | string): Promise<void>;
  delete(path: string): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
  chown(path: string, uid: number, gid: number): Promise<void>;
}
