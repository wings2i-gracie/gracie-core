import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { auditLog } from '../audit/audit.service.js';
import * as svc from './tenantMgmt.service.js';
import type { CoreLicenseTier } from '@wings2i-gracie/contracts';

const router = Router();

// requireAuth applies to every route in this router
router.use(requireAuth);

// ── exit support mode — auth only, no super_admin check (token has role=org_admin) ──
router.post('/support-mode/:sessionId/exit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.isSupportMode) {
      res.status(403).json({ success: false, error: 'Not in support mode', code: 'FORBIDDEN' });
      return;
    }
    const session = await svc.exitSupportMode(req.params.sessionId as string);
    await auditLog({
      userId: req.user.id,
      action: 'support_mode_exited',
      module: 'tenant_management',
      recordId: session.tenantId,
      after: { sessionId: session.id },
    });
    res.json({ success: true, data: session });
  } catch (err) { next(err); }
});

// All routes below require super_admin role
router.use(requireRole('super_admin'));

// ── List tenants ──────────────────────────────────────────────────────────────
router.get('/tenants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 25;
    const status = (req.query.status as string) || 'all';
    const search = req.query.search as string | undefined;

    const result = await svc.listTenants({ page, pageSize, status: status as svc.ListTenantsFilter['status'], search });
    res.json({ success: true, data: result.tenants, meta: { page: result.page, pageSize: result.pageSize, total: result.total } });
  } catch (err) { next(err); }
});

// ── Create tenant ─────────────────────────────────────────────────────────────
router.post('/tenants', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, slug, initialLicenseProductKey, initialLicenseTier } = req.body as {
      name?: string;
      slug?: string;
      initialLicenseProductKey?: string;
      initialLicenseTier?: CoreLicenseTier;
    };

    if (!name?.trim() || !slug?.trim()) {
      res.status(400).json({ success: false, error: 'name and slug are required', code: 'VALIDATION_ERROR' });
      return;
    }

    const tenant = await svc.createTenant({
      name: name.trim(),
      slug: slug.trim(),
      createdBy: req.user!.id,
      initialLicenseProductKey,
      initialLicenseTier,
    });

    await auditLog({
      userId: req.user!.id,
      action: 'tenant.created',
      module: 'tenant_management',
      recordId: tenant.id,
      after: { name: tenant.name, slug: tenant.slug },
    });

    res.status(201).json({ success: true, data: tenant });
  } catch (err) { next(err); }
});

// ── Get tenant detail ─────────────────────────────────────────────────────────
router.get('/tenants/:tenantId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await svc.getTenant(req.params.tenantId as string);
    res.json({ success: true, data: tenant });
  } catch (err) { next(err); }
});

// ── Suspend tenant ────────────────────────────────────────────────────────────
router.post('/tenants/:tenantId/suspend', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body as { reason?: string };
    const tenant = await svc.suspendTenant(req.params.tenantId as string);
    await auditLog({
      userId: req.user!.id,
      action: 'tenant.suspended',
      module: 'tenant_management',
      recordId: tenant.id,
      after: { reason: reason ?? null },
    });
    res.json({ success: true, data: tenant });
  } catch (err) { next(err); }
});

// ── Reactivate tenant ─────────────────────────────────────────────────────────
router.post('/tenants/:tenantId/reactivate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await svc.reactivateTenant(req.params.tenantId as string);
    await auditLog({
      userId: req.user!.id,
      action: 'tenant.reactivated',
      module: 'tenant_management',
      recordId: tenant.id,
    });
    res.json({ success: true, data: tenant });
  } catch (err) { next(err); }
});

// ── Archive tenant ────────────────────────────────────────────────────────────
router.post('/tenants/:tenantId/archive', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tenant = await svc.archiveTenant(req.params.tenantId as string, req.user!.id);
    await auditLog({
      userId: req.user!.id,
      action: 'tenant.archived',
      module: 'tenant_management',
      recordId: tenant.id,
    });
    res.json({ success: true, data: tenant });
  } catch (err) { next(err); }
});

// ── List licenses ─────────────────────────────────────────────────────────────
router.get('/tenants/:tenantId/licenses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const licenses = await svc.getLicenses(req.params.tenantId as string);
    res.json({ success: true, data: licenses });
  } catch (err) { next(err); }
});

// ── Assign license ────────────────────────────────────────────────────────────
router.post('/tenants/:tenantId/licenses', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productKey, tier, validUntil } = req.body as {
      productKey?: string;
      tier?: CoreLicenseTier;
      validUntil?: string;
    };

    if (!productKey?.trim() || !tier) {
      res.status(400).json({ success: false, error: 'productKey and tier are required', code: 'VALIDATION_ERROR' });
      return;
    }

    const validTiers: CoreLicenseTier[] = ['core', 'professional', 'enterprise'];
    if (!validTiers.includes(tier)) {
      res.status(400).json({ success: false, error: 'Invalid tier', code: 'VALIDATION_ERROR' });
      return;
    }

    const license = await svc.assignLicense(
      req.params.tenantId as string,
      productKey.trim(),
      tier,
      req.user!.id,
      validUntil ? new Date(validUntil) : undefined,
    );

    await auditLog({
      userId: req.user!.id,
      action: 'license.assigned',
      module: 'tenant_management',
      recordId: license.id,
      after: { tenantId: req.params.tenantId, productKey, tier, validUntil },
    });

    res.status(201).json({ success: true, data: license });
  } catch (err) { next(err); }
});

// ── Revoke license ────────────────────────────────────────────────────────────
router.delete('/tenants/:tenantId/licenses/:productKey', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await svc.revokeLicense(req.params.tenantId as string, req.params.productKey as string);
    await auditLog({
      userId: req.user!.id,
      action: 'license.revoked',
      module: 'tenant_management',
      recordId: req.params.tenantId as string,
      after: { productKey: req.params.productKey as string },
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Issue support mode token ──────────────────────────────────────────────────
router.post('/tenants/:tenantId/support-mode', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { auditNote } = req.body as { auditNote?: string };
    const result = await svc.issueSupportModeToken(req.user!.id, req.params.tenantId as string, auditNote);
    await auditLog({
      userId: req.user!.id,
      action: 'support_mode_entered',
      module: 'tenant_management',
      recordId: req.params.tenantId as string,
      after: { tenantName: result.tenantName, sessionId: result.sessionId, auditNote },
    });
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

export default router;
