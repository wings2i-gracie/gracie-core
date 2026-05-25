import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireTenant } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { auditLog } from '../audit/audit.service.js';
import * as svc from './regulatoryFeed.service.js';
import type { FeedReviewParams } from '@wings2i-gracie/contracts';

const router = Router();

router.use(requireAuth);

// ── Tenant-facing notification routes (requireTenant, no super_admin check) ───

router.get(
  '/notifications',
  requireTenant,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const unreadOnly = req.query.unread === 'true';
      const notifications = await svc.getTenantNotifications(req.user!.tenantId!, unreadOnly);
      res.json({ success: true, data: notifications });
    } catch (err) { next(err); }
  },
);

router.post(
  '/notifications/:id/read',
  requireTenant,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const notification = await svc.markNotificationRead(
        req.user!.tenantId!,
        req.params.id as string,
      );
      res.json({ success: true, data: notification });
    } catch (err) { next(err); }
  },
);

// ── All routes below require super_admin ──────────────────────────────────────

router.use(requireRole('super_admin'));

// ── Feed Sources ──────────────────────────────────────────────────────────────

router.get('/sources', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const sources = await svc.listFeedSources(includeInactive);
    res.json({ success: true, data: sources });
  } catch (err) { next(err); }
});

router.post('/sources', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, url, scrapeSchedule, parseRules, isActive } = req.body as {
      name?: string;
      url?: string;
      scrapeSchedule?: string;
      parseRules?: Record<string, unknown>;
      isActive?: boolean;
    };

    if (!name?.trim() || !url?.trim()) {
      res.status(400).json({ success: false, error: 'name and url are required', code: 'VALIDATION_ERROR' });
      return;
    }

    const source = await svc.registerFeedSource({ name: name.trim(), url: url.trim(), scrapeSchedule, parseRules, isActive });

    await auditLog({
      userId: req.user!.id,
      action: 'feed_source.created',
      module: 'regulatory_feed',
      recordId: source.id,
      after: { name: source.name, url: source.url },
    });

    res.status(201).json({ success: true, data: source });
  } catch (err) { next(err); }
});

router.patch('/sources/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, url, scrapeSchedule, parseRules, isActive } = req.body as {
      name?: string;
      url?: string;
      scrapeSchedule?: string | null;
      parseRules?: Record<string, unknown> | null;
      isActive?: boolean;
    };

    const source = await svc.updateFeedSource(req.params.id as string, { name, url, scrapeSchedule, parseRules, isActive });

    await auditLog({
      userId: req.user!.id,
      action: 'feed_source.updated',
      module: 'regulatory_feed',
      recordId: source.id,
      after: { name: source.name, url: source.url, isActive: source.isActive },
    });

    res.json({ success: true, data: source });
  } catch (err) { next(err); }
});

router.delete('/sources/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await svc.deleteFeedSource(req.params.id as string);

    await auditLog({
      userId: req.user!.id,
      action: 'feed_source.deleted',
      module: 'regulatory_feed',
      recordId: req.params.id as string,
    });

    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Feed Items ────────────────────────────────────────────────────────────────

router.get('/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 25;
    const reviewStatus = req.query.reviewStatus as svc.ListFeedItemsFilter['reviewStatus'];
    const sourceId = req.query.sourceId as string | undefined;
    const regulationCode = req.query.regulationCode as string | undefined;
    const search = req.query.search as string | undefined;

    const result = await svc.listFeedItems({ page, pageSize, reviewStatus, sourceId, regulationCode, search });
    res.json({ success: true, data: result.items, meta: { page: result.page, pageSize: result.pageSize, total: result.total } });
  } catch (err) { next(err); }
});

router.get('/items/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const item = await svc.getFeedItem(req.params.id as string);
    res.json({ success: true, data: item });
  } catch (err) { next(err); }
});

router.post('/items/:id/review', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { action, regulationCode } = req.body as Partial<FeedReviewParams>;

    if (!action || !['approve', 'reject', 'map'].includes(action)) {
      res.status(400).json({ success: false, error: 'action must be approve, reject, or map', code: 'VALIDATION_ERROR' });
      return;
    }

    if (action === 'map' && !regulationCode?.trim()) {
      res.status(400).json({ success: false, error: 'regulationCode is required for map action', code: 'VALIDATION_ERROR' });
      return;
    }

    const item = await svc.reviewFeedItem(req.params.id as string, req.user!.id, { action, regulationCode });

    await auditLog({
      userId: req.user!.id,
      action: `feed_item.${action}d`,
      module: 'regulatory_feed',
      recordId: item.id,
      after: { reviewStatus: item.reviewStatus, regulationCode: item.regulationCode },
    });

    res.json({ success: true, data: item });
  } catch (err) { next(err); }
});

export default router;
