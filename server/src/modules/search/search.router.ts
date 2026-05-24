import { Router, type Request, type Response } from 'express';
import { requireAuth, requireTenant } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import {
  searchRecords,
  reindexModule,
  deleteSearchIndex,
  type SearchIndexEntry,
} from './search.service.js';

const router = Router();

router.use(requireAuth, requireTenant);

// GET /?q=&modules= — full-text search, grouped by module
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const q = (req.query.q as string | undefined)?.trim() ?? '';
  const modulesParam = req.query.modules as string | undefined;
  const modules = modulesParam ? modulesParam.split(',').filter(Boolean) : undefined;

  if (q.length < 2) {
    res.json({ success: true, data: {}, meta: { total: 0, query: q } });
    return;
  }

  try {
    const results = await searchRecords(req.user!.tenantId!, q, modules);

    const grouped: Record<string, typeof results> = {};
    for (const r of results) {
      if (!grouped[r.moduleKey]) grouped[r.moduleKey] = [];
      grouped[r.moduleKey].push(r);
    }

    res.json({
      success: true,
      data: grouped,
      meta: { total: results.length, query: q },
    });
  } catch (err) {
    console.error('[core/search GET /] Error:', err);
    res.json({ success: true, data: {}, meta: { total: 0, query: q } });
  }
});

// POST /reindex/:moduleKey — org_admin only, replaces all entries for the module
router.post('/reindex/:moduleKey', requireRole('org_admin', 'super_admin'), async (req: Request, res: Response): Promise<void> => {
  const { moduleKey } = req.params as { moduleKey: string };
  const entries = req.body.entries as SearchIndexEntry[] | undefined;

  if (!Array.isArray(entries)) {
    res.status(400).json({ success: false, error: 'entries array required', code: 'VALIDATION_ERROR' });
    return;
  }

  try {
    await reindexModule(req.user!.tenantId!, moduleKey, entries);
    res.json({ success: true, data: { reindexed: entries.length } });
  } catch (err) {
    console.error('[core/search POST /reindex] Error:', err);
    res.status(500).json({ success: false, error: 'Reindex failed', code: 'INTERNAL_SERVER_ERROR' });
  }
});

// DELETE /:moduleKey/:recordId — soft deletes one entry
router.delete('/:moduleKey/:recordId', async (req: Request, res: Response): Promise<void> => {
  const { moduleKey, recordId } = req.params as { moduleKey: string; recordId: string };

  try {
    await deleteSearchIndex(req.user!.tenantId!, moduleKey, recordId);
    res.json({ success: true });
  } catch (err) {
    console.error('[core/search DELETE] Error:', err);
    res.status(500).json({ success: false, error: 'Delete failed', code: 'INTERNAL_SERVER_ERROR' });
  }
});

export default router;
