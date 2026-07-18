import type {
  InstanceConfiguration,
  InstanceMetrics,
  ConsoleDriver,
  TerminalDriver,
  FilesystemDriver,
} from './types';

export interface VirtualizationDriver {
  name: string;
  create(id: string, config: InstanceConfiguration): Promise<void>;
  destroy(id: string): Promise<void>;
  reinstall(id: string, image: string, config: InstanceConfiguration): Promise<void>;
  start(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  restart(id: string): Promise<void>;
  suspend(id: string): Promise<void>;
  resume(id: string): Promise<void>;
  resize(id: string, limits: any): Promise<void>;
  rename(id: string, newName: string): Promise<void>;
  
  getConsole(id: string): ConsoleDriver;
  getTerminal(id: string): TerminalDriver;
  getFilesystem(id: string): FilesystemDriver;
  getMetrics(id: string): Promise<InstanceMetrics>;
}
