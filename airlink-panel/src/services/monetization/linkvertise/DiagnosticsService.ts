import prisma from '../../../db';
import logger from '../../../handlers/logger';
import { LinkvertiseConfig } from '../providers/linkvertiseTypes';
import { AnalyticsService } from './AnalyticsService';

export interface DiagnosticReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: DiagnosticCheck[];
  config: Partial<LinkvertiseConfig>;
  analytics: Awaited<ReturnType<typeof AnalyticsService.getAnalytics>> | null;
  timestamp: Date;
}

export interface DiagnosticCheck {
  name: string;
  passed: boolean;
  message: string;
}

export class DiagnosticsService {
  /**
   * Run all diagnostic checks and produce a report.
   */
  static async runDiagnostics(config: LinkvertiseConfig): Promise<DiagnosticReport> {
    const checks: DiagnosticCheck[] = [];

    // Check 1: Publisher ID present
    checks.push({
      name: 'Publisher ID',
      passed: !!config.publisherId && config.publisherId.length > 0,
      message: config.publisherId ? `Set to: ${config.publisherId}` : 'Missing publisher ID',
    });

    // Check 2: Callback secret strength
    checks.push({
      name: 'Callback Secret',
      passed: !!config.callbackSecret && config.callbackSecret.length >= 32,
      message: config.callbackSecret
        ? (config.callbackSecret.length >= 32 ? `Strong (${config.callbackSecret.length} chars)` : `Weak (${config.callbackSecret.length} chars, need 32+)`)
        : 'Not configured',
    });

    // Check 3: Default destination is HTTPS
    checks.push({
      name: 'Default Destination',
      passed: config.defaultDestination?.startsWith('https://') ?? false,
      message: config.defaultDestination
        ? (config.defaultDestination.startsWith('https://') ? 'Using HTTPS' : 'WARNING: Not using HTTPS')
        : 'Not configured',
    });

    // Check 4: Dynamic links enabled
    checks.push({
      name: 'Dynamic Links',
      passed: config.enableDynamicLinks,
      message: config.enableDynamicLinks ? 'Enabled' : 'Disabled',
    });

    // Check 5: Rewards enabled
    checks.push({
      name: 'Reward Processing',
      passed: config.enableRewards,
      message: config.enableRewards ? 'Enabled' : 'Disabled',
    });

    // Check 6: Database connectivity
    let dbCheck = false;
    try {
      await prisma.linkvertiseSession.count();
      dbCheck = true;
    } catch {
      dbCheck = false;
    }
    checks.push({
      name: 'Database Connection',
      passed: dbCheck,
      message: dbCheck ? 'Connected' : 'Failed to query LinkvertiseSession table',
    });

    // Check 7: Recent session activity (last hour)
    let recentActivity = false;
    try {
      const recentCount = await prisma.linkvertiseSession.count({
        where: { createdAt: { gte: new Date(Date.now() - 3600_000) } },
      });
      recentActivity = recentCount > 0;
      checks.push({
        name: 'Recent Activity',
        passed: true,
        message: `${recentCount} sessions in the last hour`,
      });
    } catch {
      checks.push({
        name: 'Recent Activity',
        passed: false,
        message: 'Failed to query recent sessions',
      });
    }

    // Check 8: Failed sessions (alert if > 10% in last hour)
    try {
      const [total, failed] = await Promise.all([
        prisma.linkvertiseSession.count({
          where: { createdAt: { gte: new Date(Date.now() - 3600_000) } },
        }),
        prisma.linkvertiseSession.count({
          where: {
            status: 'FAILED',
            createdAt: { gte: new Date(Date.now() - 3600_000) },
          },
        }),
      ]);
      const failRate = total > 0 ? (failed / total) * 100 : 0;
      checks.push({
        name: 'Failure Rate',
        passed: failRate < 10,
        message: `${failRate.toFixed(1)}% failure rate (${failed}/${total})`,
      });
    } catch {
      checks.push({
        name: 'Failure Rate',
        passed: false,
        message: 'Failed to compute',
      });
    }

    // Overall status
    const failedChecks = checks.filter(c => !c.passed);
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (failedChecks.length > 0 && failedChecks.length <= 2) status = 'degraded';
    if (failedChecks.length > 2) status = 'unhealthy';

    // Get analytics
    let analytics = null;
    try {
      analytics = await AnalyticsService.getAnalytics(24);
    } catch (err) {
      logger.error('[DIAGNOSTICS] Failed to fetch analytics:', err);
    }

    return {
      status,
      checks,
      config: {
        publisherId: config.publisherId,
        enabled: config.enabled,
        enableDynamicLinks: config.enableDynamicLinks,
        enableRewards: config.enableRewards,
        enableCallbackProcessing: config.enableCallbackProcessing,
        enableAnalytics: config.enableAnalytics,
        enableDiagnostics: config.enableDiagnostics,
        enableTestMode: config.enableTestMode,
      },
      analytics,
      timestamp: new Date(),
    };
  }

  /**
   * Generate a mock session for testing the full pipeline.
   */
  static async createMockSession(userId: number, config: LinkvertiseConfig): Promise<number | null> {
    if (!config.enableTestMode) {
      logger.warn('[DIAGNOSTICS] Cannot create mock session: test mode disabled');
      return null;
    }

    const session = await prisma.linkvertiseSession.create({
      data: {
        token: `mock-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`,
        userId,
        campaign: 'test',
        placement: 'diagnostics',
        rewardType: 'COINS',
        rewardAmount: 1,
        destination: config.defaultDestination || 'https://example.com',
        status: 'CREATED',
      },
    });

    logger.info(`[DIAGNOSTICS] Created mock session id=${session.id} for userId=${userId}`);
    return session.id;
  }
}
