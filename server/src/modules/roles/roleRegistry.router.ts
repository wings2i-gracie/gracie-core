import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { listRegisteredRoles, getConfigurableRoleKeys } from './roleRegistry.service.js';

const router = Router();

/** GET /api/v1/core/roles — all registered roles (auth required). */
router.get('/', requireAuth, (_req, res) => {
  res.json({ success: true, data: listRegisteredRoles() });
});

/** GET /api/v1/core/roles/configurable — roles that appear in the Permissions Matrix. */
router.get('/configurable', requireAuth, (_req, res) => {
  res.json({ success: true, data: getConfigurableRoleKeys() });
});

export default router;
