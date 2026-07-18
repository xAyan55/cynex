import { Request } from 'express';
import { MonetizationProvider } from './MonetizationProvider';
import { RewardType } from '../../../generated/prisma/client';
import { LinkvertiseConfig } from './linkvertiseTypes';
import { LinkBuilder } from '../linkvertise/LinkBuilder';
import { TokenService } from '../linkvertise/TokenService';
import { CallbackService } from '../linkvertise/CallbackService';
import { RewardService } from '../linkvertise/RewardService';
import { AnalyticsService } from '../linkvertise/AnalyticsService';
import { DiagnosticsService } from '../linkvertise/DiagnosticsService';
import { CleanupService } from '../linkvertise/CleanupService';
import prisma from '../../../db';
import logger from '../../../handlers/logger';

const DEFAULT_CONFIG: LinkvertiseConfig = {
  publisherId: '',
  enabled: false,
  useDynamicLinks: true,
  defaultDestination: '',
  redirectDelay: 0,
  verifyCallbacks: true,
  callbackSecret: '',
  allowGuestLinks: false,
  analyticsEnabled: true,
  retryFailures: true,
  enableDynamicLinks: true,
  enableRewards: true,
  enableCallbackProcessing: true,
  enableAnalytics: true,
  enableDiagnostics: true,
  enableTestMode: false,
  enableCsvExport: false,
  rewardRules: { earn: 20, bonus: 25, afk: 15, store: 10 },
};

export class LinkvertiseProvider implements MonetizationProvider {
  readonly id = 'linkvertise';
  readonly name = 'Linkvertise';
  readonly version = '2.0.0';

  private config: LinkvertiseConfig = { ...DEFAULT_CONFIG };
  private tokenService: TokenService | null = null;
  private callbackService: CallbackService | null = null;
  private rewardService: RewardService | null = null;
  private cleanupService: CleanupService | null = null;

  async initialize(): Promise<void> {
    logger.info('[LinkvertiseProvider] Initializing v2.0.0');

    if (this.config.callbackSecret && this.config.callbackSecret.length >= 32) {
      this.tokenService = new TokenService(this.config.callbackSecret);
      this.callbackService = new CallbackService(this.tokenService);
    }

    this.rewardService = new RewardService(this.config.rewardRules);

    this.cleanupService = new CleanupService();
    this.cleanupService.start();

    logger.info('[LinkvertiseProvider] Initialized successfully');
  }

  async shutdown(): Promise<void> {
    if (this.cleanupService) {
      this.cleanupService.stop();
    }
    logger.info('[LinkvertiseProvider] Shut down');
  }

  async reloadConfiguration(config: Record<string, any>): Promise<void> {
    this.config = { ...DEFAULT_CONFIG, ...config } as LinkvertiseConfig;

    // Reinitialize services that depend on config
    if (this.config.callbackSecret && this.config.callbackSecret.length >= 32) {
      this.tokenService = new TokenService(this.config.callbackSecret);
      this.callbackService = new CallbackService(this.tokenService);
    }

    this.rewardService = new RewardService(this.config.rewardRules);
    logger.info('[LinkvertiseProvider] Configuration reloaded');
  }

  async validateConfiguration(config: Record<string, any>): Promise<void> {
    if (!config.publisherId && !config.userId) {
      throw new Error('Linkvertise Publisher ID is required.');
    }
    if (!config.callbackSecret || (config.callbackSecret as string).length < 32) {
      throw new Error('Callback Secret must be at least 32 characters.');
    }
    if (config.defaultDestination && !config.defaultDestination.startsWith('https://')) {
      throw new Error('Default Destination must use HTTPS.');
    }
  }

  async generateLink(user: any, offer: any, targetUrl: string, options?: any): Promise<string> {
    if (!this.tokenService) {
      throw new Error('LinkvertiseProvider not configured: missing callback secret.');
    }

    const publisherId = this.config.publisherId;
    const campaign = options?.campaign || 'earn';
    const placement = options?.placement || 'offer_wall';
    const rewardAmount = this.rewardService?.getRewardAmount(campaign) ?? 10;

    // 1. Generate a signed token
    const token = this.tokenService.generate(user.id, 'COINS', campaign, placement);

    // 2. Create a session record
    await prisma.linkvertiseSession.create({
      data: {
        token,
        userId: user.id,
        campaign,
        placement,
        rewardType: 'COINS',
        rewardAmount,
        destination: targetUrl,
        status: 'CREATED',
      },
    });

    // 3. Build the dynamic Linkvertise URL
    const builder = new LinkBuilder(publisherId);
    const url = builder.buildOffer(token, targetUrl, rewardAmount);

    logger.info(`[LinkvertiseProvider] Link generated for user=${user.id} campaign=${campaign}`);
    return url;
  }

  async verifyCallback(req: Request): Promise<boolean> {
    if (!this.callbackService || !this.config.enableCallbackProcessing) {
      logger.warn('[LinkvertiseProvider] Callback processing disabled or not configured');
      return false;
    }

    const result = await this.callbackService.processCallback(req);

    if (!result.success) {
      logger.warn(`[LinkvertiseProvider] Callback rejected: ${result.error}`);
      return false;
    }

    // Process reward if enabled
    if (this.config.enableRewards && this.rewardService && result.sessionId) {
      const rewardResult = await this.rewardService.processReward(result.sessionId);
      if (!rewardResult.success) {
        logger.error(`[LinkvertiseProvider] Reward failed for session=${result.sessionId}: ${rewardResult.error}`);
        // Callback was valid even if reward failed - it will be retried
      }
    }

    return result.success;
  }

  async healthCheck(): Promise<{ status: 'HEALTHY' | 'DEGRADED' | 'OFFLINE' | 'UNKNOWN'; responseTime: number; error?: string }> {
    const start = Date.now();
    try {
      if (!this.config.publisherId) {
        return { status: 'DEGRADED', responseTime: Date.now() - start, error: 'Publisher ID not configured' };
      }
      if (!this.tokenService) {
        return { status: 'DEGRADED', responseTime: Date.now() - start, error: 'Callback secret not configured or too short' };
      }

      // Quick DB check
      await prisma.linkvertiseSession.count({ take: 1 });

      return { status: 'HEALTHY', responseTime: Date.now() - start };
    } catch (err: any) {
      return { status: 'OFFLINE', responseTime: Date.now() - start, error: err.message };
    }
  }

  renderConfigurationFields(): Array<{ key: string; label: string; type: string; default?: any }> {
    return [
      { key: 'publisherId', label: 'Publisher / User ID', type: 'text' },
      { key: 'apiKey', label: 'API Key (Optional)', type: 'password' },
      { key: 'callbackSecret', label: 'Callback Secret Key (min 32 chars)', type: 'password' },
      { key: 'defaultDestination', label: 'Target Redirect URL (HTTPS)', type: 'text' },
      { key: 'enableDynamicLinks', label: 'Enable Dynamic Links', type: 'toggle', default: true },
      { key: 'enableRewards', label: 'Enable Reward Processing', type: 'toggle', default: true },
      { key: 'enableCallbackProcessing', label: 'Enable Callback Processing', type: 'toggle', default: true },
      { key: 'enableAnalytics', label: 'Enable Analytics', type: 'toggle', default: true },
      { key: 'enableDiagnostics', label: 'Enable Diagnostics', type: 'toggle', default: true },
      { key: 'enableTestMode', label: 'Enable Test Mode', type: 'toggle', default: false },
      { key: 'enableCsvExport', label: 'Enable CSV Export', type: 'toggle', default: false },
    ];
  }

  async getStatistics(): Promise<Record<string, any>> {
    if (!this.config.enableAnalytics) {
      return { analyticsDisabled: true };
    }
    return AnalyticsService.getAnalytics(24);
  }

  supportsReward(type: RewardType): boolean {
    return type === RewardType.COINS;
  }

  supportsWebhook(): boolean {
    return true;
  }

  supportsClientScript(): boolean {
    return true;
  }

  // ─── Extended API (for admin routes) ────────────────────────────

  getConfig(): LinkvertiseConfig {
    return { ...this.config };
  }

  getTokenService(): TokenService | null {
    return this.tokenService;
  }

  getRewardService(): RewardService | null {
    return this.rewardService;
  }

  async getDiagnostics() {
    return DiagnosticsService.runDiagnostics(this.config);
  }

  async createMockSession(userId: number) {
    return DiagnosticsService.createMockSession(userId, this.config);
  }
}
