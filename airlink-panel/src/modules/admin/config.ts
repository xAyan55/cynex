import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import prisma from '../../db';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import logger from '../../handlers/logger';
import { ConfigService } from '../../services/config/ConfigService';
import { ConfigCategory } from '../../generated/prisma/client';
import { AuditService } from '../../services/AuditService';

const VALID_CATEGORIES = new Set(Object.values(ConfigCategory));

const adminModule: Module = {
  info: {
    name: 'Admin Config Module',
    description: 'Configuration and coupon management for the admin panel.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'CynexGP',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    // ── GET /admin/config ───────────────────────────────────────────────────
    router.get(
      '/admin/config',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const userId = req.session?.user?.id;
          const user = await prisma.users.findUnique({ where: { id: userId } });
          if (!user) return res.redirect('/login');

          const settings = await prisma.settings.findUnique({ where: { id: 1 } });

          const page = parseInt(req.query.page as string, 10) || 1;

          const [economy, store, defaults, renewals, limits, ui, auditLogs, products, transactionCount, walletAgg] =
            await Promise.all([
              ConfigService.economy(),
              ConfigService.store(),
              ConfigService.defaults(),
              ConfigService.renewals(),
              ConfigService.limits(),
              ConfigService.ui(),
              AuditService.getLogs({ page, limit: 50 }),
              prisma.storeProduct.findMany({ orderBy: { displayOrder: 'asc' } }),
              prisma.storePurchase.count(),
              prisma.wallet.aggregate({ _sum: { balance: true } }),
            ]);

          const totalCoins = walletAgg._sum.balance ?? 0;

          res.render('admin/config/config', {
            user,
            req,
            settings,
            economy,
            store,
            defaults,
            renewals,
            limits,
            ui,
            auditLogs,
            products,
            transactions: transactionCount,
            totalCoins,
          });
        } catch (error) {
          logger.error('Error loading admin config:', error);
          return res.redirect('/login');
        }
      },
    );

    // ── POST /admin/config/:category ────────────────────────────────────────
    router.post(
      '/admin/config/:category',
      isAuthenticated(true),
      async (req: Request, res: Response) => {
        try {
          const category = String(req.params.category || '').toUpperCase();

          if (!VALID_CATEGORIES.has(category as ConfigCategory)) {
            return res.status(400).json({ success: false, error: 'Invalid config category.' });
          }

          await ConfigService.updateCategory(category as ConfigCategory, req.body);

          await AuditService.log({
            action: 'CONFIG_UPDATED',
            adminId: req.session?.user?.id ?? null,
            details: { name: category, reason: Object.keys(req.body).join(', ') } as any,
            ipAddress: req.ip,
          });

          res.json({ success: true });
        } catch (error) {
          logger.error('Error saving config:', error);
          res.status(500).json({ success: false, error: 'Failed to save configuration.' });
        }
      },
    );

    return router;
  },
};

export default adminModule;
