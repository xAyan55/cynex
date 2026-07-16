import { Router, Request, Response } from 'express';
import { Module } from '../../handlers/moduleInit';
import { isAuthenticated } from '../../handlers/utils/auth/authUtil';
import { StoreService } from '../../services/StoreService';
import { WalletService } from '../../services/WalletService';
import { ResourceService } from '../../services/ResourceService';
import { ConfigService } from '../../services/config/ConfigService';
import { AllocationType } from '../../generated/prisma/client';
import logger from '../../handlers/logger';

const storeModule: Module = {
  info: {
    name: 'Store Module',
    description: 'Browse and purchase resources.',
    version: '2.0.0',
    moduleVersion: '1.0.0',
    author: 'CynexGP',
    license: 'MIT',
  },

  router: () => {
    const router = Router();

    router.get('/store', isAuthenticated(), async (req: Request, res: Response) => {
      try {
        const userId = req.session!.user!.id;
        const [products, balance, resources] = await Promise.all([
          StoreService.getProducts(),
          WalletService.getBalance(userId),
          ResourceService.getUserResources(userId),
        ]);

        res.render('user/store', {
          user: req.session!.user,
          req,
          products,
          balance,
          ram: resources.ram,
          cpu: resources.cpu,
          disk: resources.disk,
          title: 'Store',
        });
      } catch (error) {
        logger.error('Store page error:', error);
        res.status(500).send('Error loading store.');
      }
    });

    router.post('/store/buy/:id', isAuthenticated(), async (req: Request, res: Response) => {
      try {
        const userId = req.session!.user!.id;
        const productId = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
        const result = await StoreService.purchase({
          userId,
          productId,
          ipAddress: (req.ip as unknown) as string,
        });
        res.json({ success: true, ...result });
      } catch (error: any) {
        res.json({ success: false, error: error.message || 'Purchase failed.' });
      }
    });

    return router;
  },
};

export default storeModule;
