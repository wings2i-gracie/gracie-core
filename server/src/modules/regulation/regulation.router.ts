import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth, requireTenant } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import {
  listRegulations,
  getRegulation,
  listRequirements,
  listPrinciples,
  listDocuments,
  listRegulationsWithToggles,
  toggleRegulation,
} from './regulation.service.js';

const router = Router();

router.use(requireAuth);

// GET /api/v1/core/regulations
router.get('/regulations', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listRegulations();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/core/regulations/:id
router.get('/regulations/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getRegulation(req.params.id as string);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/core/regulations/:id/requirements
router.get('/regulations/:id/requirements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listRequirements(req.params.id as string);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/core/regulations/:id/documents
router.get('/regulations/:id/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const saView = req.query.saView === 'true';
    const data = await listDocuments(req.params.id as string, saView);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/core/framework-groupings
router.get('/framework-groupings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listPrinciples();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/core/tenant/regulations
router.get(
  '/tenant/regulations',
  requireTenant,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await listRegulationsWithToggles(req.user!.tenantId!, req.user!.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

// PUT /api/v1/core/tenant/regulations/:id/toggle
router.put(
  '/tenant/regulations/:id/toggle',
  requireTenant,
  requireRole('org_admin', 'super_admin', 'compliance_manager'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { enabled } = req.body as { enabled: boolean };
      const data = await toggleRegulation(
        req.user!.tenantId!,
        req.params.id as string,
        Boolean(enabled),
        req.user!.id,
      );
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
