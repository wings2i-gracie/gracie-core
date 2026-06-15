// Seq 4c-0b: write path for core_user_function_grants.
//
// Exposes grant management so the (previously unwritable) grant table can be
// populated. Tenant-scoped admin endpoints — tenant_id always comes from the
// trusted auth context (req.user.tenantId), never from the request body.
// Mutations + reads are admin-only (super_admin | org_admin), matching Core's
// user-management guard. Reuses the existing service functions verbatim.
import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth, requireTenant } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { auditLog } from '../audit/audit.service.js';
import {
  grantFunctionToUser,
  revokeFunctionGrant,
  listFunctionGrants,
} from './userFunctionGrant.service.js';

const router = Router();

// Every route requires auth, a tenant context, and an admin role.
router.use(requireAuth, requireTenant, requireRole('super_admin', 'org_admin'));

// ── List a user's function grants ───────────────────────────────────────────
router.get('/users/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const grants = await listFunctionGrants(req.params.userId as string, req.user!.tenantId!);
    res.json({ success: true, data: grants });
  } catch (err) { next(err); }
});

// ── Grant a function to a user ──────────────────────────────────────────────
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, functionId } = req.body as { userId?: string; functionId?: string };
    if (!userId?.trim() || !functionId?.trim()) {
      res.status(400).json({ success: false, error: 'userId and functionId are required', code: 'VALIDATION_ERROR' });
      return;
    }

    // tenantId is taken from the trusted auth context — never from the body.
    // grantFunctionToUser validates that both the target user and function
    // belong to this tenant before inserting.
    const grant = await grantFunctionToUser({
      tenantId: req.user!.tenantId!,
      userId: userId.trim(),
      functionId: functionId.trim(),
      grantedBy: req.user!.id,
    });

    await auditLog({
      userId: req.user!.id,
      tenantId: req.user!.tenantId!,
      action: 'user_function_grant.granted',
      module: 'user_function_grants',
      recordId: grant.id,
      after: { userId: grant.userId, functionId: grant.functionId },
    });

    res.status(201).json({ success: true, data: grant });
  } catch (err) { next(err); }
});

// ── Revoke a user's function grant ──────────────────────────────────────────
router.delete('/users/:userId/functions/:functionId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.params.userId as string;
    const functionId = req.params.functionId as string;

    await revokeFunctionGrant({ tenantId: req.user!.tenantId!, userId, functionId });

    await auditLog({
      userId: req.user!.id,
      tenantId: req.user!.tenantId!,
      action: 'user_function_grant.revoked',
      module: 'user_function_grants',
      recordId: userId,
      after: { userId, functionId },
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
