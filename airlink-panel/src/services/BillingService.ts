import prisma from '../db';
import logger from '../handlers/logger';

export interface PlanDetails {
  name: string;
  priceMonthly: number;
  priceYearly: number;
  serverLimit: number;
  maxMemory: number; // in MB
  maxCpu: number;    // % (e.g. 100% = 1 core)
  maxStorage: number; // in MB
  features: string[];
}

export const HOSTER_PLANS: Record<string, PlanDetails> = {
  free: {
    name: 'Free Plan',
    priceMonthly: 0,
    priceYearly: 0,
    serverLimit: 1,
    maxMemory: 1024,
    maxCpu: 100,
    maxStorage: 5120,
    features: ['1 Server Slot', '1GB RAM limit', '5GB Disk space', 'Simulated Provision Queue', 'Hibernates when inactive'],
  },
  starter: {
    name: 'Starter Premium',
    priceMonthly: 3.99,
    priceYearly: 39.99,
    serverLimit: 3,
    maxMemory: 4096,
    maxCpu: 200,
    maxStorage: 15360,
    features: ['3 Server Slots', '4GB Dedicated RAM', '15GB NVMe SSD storage', 'Instant setup (No Queues)', '24/7 online (No Hibernation)'],
  },
  pro: {
    name: 'Pro Premium',
    priceMonthly: 7.99,
    priceYearly: 79.99,
    serverLimit: 6,
    maxMemory: 8192,
    maxCpu: 400,
    maxStorage: 30720,
    features: ['6 Server Slots', '8GB Dedicated RAM', '30GB NVMe SSD storage', 'Instant setup (No Queues)', '24/7 online (No Hibernation)', 'Priority support'],
  },
};

export class BillingService {
  /**
   * Returns current user tier and exact resources limits.
   */
  static async getUserPlan(userId: number) {
    const user = await prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) throw new Error('User not found.');

    // Determine plan type by looking at resource limits
    let planKey = 'free';
    if ((user.serverLimit || 0) >= 6) {
      planKey = 'pro';
    } else if ((user.serverLimit || 0) >= 3) {
      planKey = 'starter';
    }

    return {
      plan: HOSTER_PLANS[planKey],
      currentUsage: {
        serverLimit: user.serverLimit || 0,
        maxMemory: user.maxMemory || 0,
        maxCpu: user.maxCpu || 0,
        maxStorage: user.maxStorage || 0,
      },
    };
  }

  /**
   * Mock payment checkout ready interface. Updates user resource variables in DB.
   */
  static async purchasePlan(userId: number, planKey: string): Promise<boolean> {
    const plan = HOSTER_PLANS[planKey];
    if (!plan) throw new Error('Invalid plan selected.');

    try {
      await prisma.users.update({
        where: { id: userId },
        data: {
          serverLimit: plan.serverLimit,
          maxMemory: plan.maxMemory,
          maxCpu: plan.maxCpu,
          maxStorage: plan.maxStorage,
        },
      });

      logger.info(`BillingService: User ${userId} upgraded to ${plan.name} successfully.`);
      return true;
    } catch (error) {
      logger.error(`BillingService: Failed to purchase plan for user ${userId}`, error);
      return false;
    }
  }
}
