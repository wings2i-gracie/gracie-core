import { Router, Request, Response, NextFunction } from 'express';
import { requireTenant } from '../../middleware/auth.middleware.js';
import * as svc from './shellRegistry.service.js';

const router = Router();

// GET /products — list registered products (productKey, displayName, version)
router.get('/products', (req: Request, res: Response, next: NextFunction) => {
  try {
    const products = svc.listProducts().map((p) => ({
      productKey: p.productKey,
      displayName: p.displayName,
      version: p.version,
    }));
    res.json({ success: true, data: products });
  } catch (err) { next(err); }
});

// GET /products/:productKey/sidebar — sidebar config for a product
router.get(
  '/products/:productKey/sidebar',
  requireTenant,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const sidebar = svc.getSidebar(req.params.productKey as string);
      res.json({ success: true, data: sidebar });
    } catch (err) { next(err); }
  },
);

// GET /products/:productKey/modules — module registrations for a product
router.get(
  '/products/:productKey/modules',
  requireTenant,
  (req: Request, res: Response, next: NextFunction) => {
    try {
      const modules = svc.getModules(req.params.productKey as string);
      res.json({ success: true, data: modules });
    } catch (err) { next(err); }
  },
);

export default router;
