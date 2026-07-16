import { Request } from 'express';
import { MonetizationProvider } from './MonetizationProvider';
import { RewardType } from '../../../generated/prisma/client';
import logger from '../../../handlers/logger';

export class AdsterraProvider implements MonetizationProvider {
  readonly id = 'adsterra';
  readonly name = 'Adsterra';
  readonly version = '1.0.0';

  private config: Record<string, any> = {};
  private statistics: Record<string, any> = {
    totalImpressions: 0,
    validatedClaims: 0,
  };

  async initialize(): Promise<void> {
    logger.info('Initializing Adsterra provider plugin.');
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Adsterra provider plugin.');
  }

  async reloadConfiguration(config: Record<string, any>): Promise<void> {
    this.config = config;
  }

  async validateConfiguration(config: Record<string, any>): Promise<void> {
    if (!config.publisherId) {
      throw new Error('Adsterra Publisher ID is required.');
    }
  }

  async generateLink(user: any, offer: any, targetUrl: string, options?: any): Promise<string> {
    // Adsterra operates via script insertion and direct smartlinks rather than standard redirect links
    return this.config.smartlinkId || targetUrl;
  }

  async verifyCallback(req: Request): Promise<boolean> {
    // Custom viewing check logic (e.g. user viewed the ad page for N seconds)
    const { duration, sessionToken } = req.body;
    if (sessionToken && Number(duration) >= 15) {
      this.statistics.validatedClaims++;
      return true;
    }
    return false;
  }

  async healthCheck(): Promise<{ status: 'HEALTHY' | 'DEGRADED' | 'OFFLINE' | 'UNKNOWN'; responseTime: number; error?: string }> {
    const start = Date.now();
    if (!this.config.publisherId) {
      return { status: 'DEGRADED', responseTime: Date.now() - start, error: 'Publisher ID not configured.' };
    }
    return { status: 'HEALTHY', responseTime: Date.now() - start };
  }

  renderConfigurationFields(): Array<{ key: string; label: string; type: string; default?: any }> {
    return [
      { key: 'publisherId', label: 'Publisher ID', type: 'text' },
      { key: 'smartlinkId', label: 'Smartlink Direct URL', type: 'text' },
      { key: 'popunderId', label: 'Popunder Unit ID', type: 'text' },
      { key: 'socialBarId', label: 'Social Bar Unit ID', type: 'text' },
      { key: '728x90Id', label: '728x90 Banner Unit ID', type: 'text' },
      { key: '300x250Id', label: '300x250 Banner Unit ID', type: 'text' }
    ];
  }

  async getStatistics(): Promise<Record<string, any>> {
    return this.statistics;
  }

  supportsReward(type: RewardType): boolean {
    return type === RewardType.COINS;
  }

  supportsWebhook(): boolean {
    return false;
  }

  supportsClientScript(): boolean {
    return true;
  }
}
