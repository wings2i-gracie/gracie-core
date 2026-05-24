import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth, requireTenant } from '../../middleware/auth.middleware.js';
import {
  listNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from './notifications.service.js';

const router = Router();

router.use(requireAuth, requireTenant);

// GET /api/v1/core/notifications/unread-count
router.get('/unread-count', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await getUnreadCount(req.user!.tenantId!, req.user!.id);
    res.json({ success: true, data: { count } });
  } catch (err) { next(err); }
});

// GET /api/v1/core/notifications
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query as Record<string, string>;
    const page = Math.max(1, parseInt(q.page ?? '1', 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(q.pageSize ?? '20', 10)));
    const result = await listNotifications(req.user!.tenantId!, req.user!.id, {
      unreadOnly: q.unreadOnly === 'true' || q.unread === 'true',
      moduleKey: q.module,
      page,
      pageSize,
    });
    res.json({
      success: true,
      data: { notifications: result.notifications, unreadCount: result.unreadCount },
      meta: { page, pageSize, total: result.total },
    });
  } catch (err) { next(err); }
});

// PATCH /api/v1/core/notifications/read-all — must be before /:id
router.patch('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const updatedCount = await markAllAsRead(req.user!.tenantId!, req.user!.id);
    res.json({ success: true, data: { updatedCount } });
  } catch (err) { next(err); }
});

// PATCH /api/v1/core/notifications/:id/read
router.patch('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await markAsRead(req.params.id as string, req.user!.tenantId!, req.user!.id);
    if (!result.found) {
      res.status(404).json({ success: false, error: 'Notification not found', code: 'NOT_FOUND' });
      return;
    }
    if (result.forbidden) {
      res.status(403).json({ success: false, error: "Cannot mark another user's notification as read", code: 'FORBIDDEN' });
      return;
    }
    res.json({ success: true, data: { notification: result.notification } });
  } catch (err) { next(err); }
});

// DELETE /api/v1/core/notifications/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const success = await deleteNotification(req.params.id as string, req.user!.tenantId!);
    if (!success) {
      res.status(404).json({ success: false, error: 'Notification not found', code: 'NOT_FOUND' });
      return;
    }
    res.json({ success: true, data: {} });
  } catch (err) { next(err); }
});

export default router;
