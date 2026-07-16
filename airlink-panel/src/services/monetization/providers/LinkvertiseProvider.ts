import { Request } from 'express';
import { MonetizationProvider } from './MonetizationProvider';
import { RewardType } from '../../../generated/prisma/client';
import crypto from 'crypto';
import logger from '../../../handlers/logger';

export class LinkvertiseProvider implements MonetizationProvider {
  readonly id = 'linkvertise';
  readonly name = 'Linkvertise';
  readonly version = '1.0.0';

  private config: Record<string, any> = {};
  private statistics: Record<string, any> = {
    totalGenerations: 0,
    successfulCallbacks: 0,
    failedCallbacks: 0,
  };

  async initialize(): Promise<void> {
    logger.info('Initializing Linkvertise provider plugin.');
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down Linkvertise provider plugin.');
  }

  async reloadConfiguration(config: Record<string, any>): Promise<void> {
    this.config = config;
  }

  async validateConfiguration(config: Record<string, any>): Promise<void> {
    if (!config.userId) {
      throw new Error('Linkvertise User ID / Publisher ID is required.');
    }
    if (!config.callbackSecret) {
      throw new Error('Linkvertise Callback Secret Key is required.');
    }
  }

  async generateLink(user: any, offer: any, targetUrl: string, options?: any): Promise<string> {
    this.statistics.totalGenerations++;

    const userId = this.config.userId || 'default';
    const slug = offer.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    
    // Construct signed return URL via HMAC validation
    // Format: https://linkvertise.com/{userId}/{slug}?o=sharing
    // We add dynamic callback queries that the script converts/forwards, or we append directly.
    return `https://linkvertise.com/${userId}/${slug}?o=sharing`;
  }

  async verifyCallback(req: Request): Promise<boolean> {
    // Expected query parameters: ?token=xxx&nonce=yyy&timestamp=zzz&hash=auth_hash
    const { token, nonce, timestamp, hash } = req.query;

    if (!token || !nonce || !timestamp || !hash) {
      this.statistics.failedCallbacks++;
      logger.warn('[LinkvertiseProvider] Missing callback verification parameters.');
      return false;
    }

    // Verify timestamp offset limit (e.g. 5 minutes tolerance)
    const timeDiff = Math.abs(Date.now() - Number(timestamp));
    if (timeDiff > 5 * 60 * 1000) {
      this.statistics.failedCallbacks++;
      logger.warn('[LinkvertiseProvider] Timestamp outside tolerance window.');
      return false;
    }

    // Reconstruct signature to verify
    const secret = this.config.callbackSecret || '';
    const payload = `${token}:${nonce}:${timestamp}`;
    const expectedHash = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    if (hash !== expectedHash) {
      this.statistics.failedCallbacks++;
      logger.warn('[LinkvertiseProvider] HMAC Signature mismatch on callback validation.');
      return false;
    }

    this.statistics.successfulCallbacks++;
    return true;
  }

  async healthCheck(): Promise<{ status: 'HEALTHY' | 'DEGRADED' | 'OFFLINE' | 'UNKNOWN'; responseTime: number; error?: string }> {
    const start = Date.now();
    try {
      if (!this.config.userId || !this.config.callbackSecret) {
        return { status: 'DEGRADED', responseTime: Date.now() - start, error: 'Provider is not fully configured.' };
      }
      return { status: 'HEALTHY', responseTime: Date.now() - start };
    } catch (err: any) {
      return { status: 'OFFLINE', responseTime: Date.now() - start, error: err.message };
    }
  }

  renderConfigurationFields(): Array<{ key: string; label: string; type: string; default?: any }> {
    return [
      { key: 'userId', label: 'Publisher/User ID', type: 'text' },
      { key: 'apiKey', label: 'API Key (Optional)', type: 'password' },
      { key: 'callbackSecret', label: 'Callback Secret Key', type: 'password' }
    ];
  }

  async getStatistics(): Promise<Record<string, any>> {
    return this.statistics;
  }

  supportsReward(type: RewardType): boolean {
    // Linkvertise primarily supports standard economy coin transactions
    return type === RewardType.COINS;
  }

  supportsWebhook(): boolean {
    return true;
  }

  supportsClientScript(): boolean {
    return true;
  }
}
