import type { VirtualizationDriver } from './VirtualizationDriver';

export class DriverRegistry {
  private static drivers = new Map<string, VirtualizationDriver>();

  static register(name: string, driver: VirtualizationDriver): void {
    this.drivers.set(name.toLowerCase(), driver);
  }

  static get(name: string): VirtualizationDriver {
    const driver = this.drivers.get(name.toLowerCase());
    if (!driver) {
      throw new Error(`Virtualization driver "${name}" is not registered.`);
    }
    return driver;
  }

  static getRegisteredNames(): string[] {
    return Array.from(this.drivers.keys());
  }
}
