import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth, requireTenant } from '../../middleware/auth.middleware.js';
import {
  createTask,
  listTasks,
  getTaskById,
  updateTask,
  softDeleteTask,
  getTaskStats,
  listTemplates,
  createTemplate,
  createTaskFromTemplate,
} from './tasks.service.js';

const router = Router();

router.use(requireAuth, requireTenant);

// ── Stats ─────────────────────────────────────────────────────────────────────

router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getTaskStats(req.user!.tenantId!);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ── Templates ─────────────────────────────────────────────────────────────────

router.get('/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listTemplates(req.user!.tenantId!);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/templates', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await createTemplate(req.user!.tenantId!, req.user!.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/templates/:id/create-task', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await createTaskFromTemplate(req.params.id as string, req.user!.tenantId!, req.user!.id, req.body);
    if (!data) { res.status(404).json({ success: false, error: 'Template not found' }); return; }
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

// ── Tasks ─────────────────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query as Record<string, string>;
    const page = Math.max(1, parseInt(q.page ?? '1'));
    const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize ?? '25')));
    const result = await listTasks({
      tenantId: req.user!.tenantId!,
      status: q.status ? q.status.split(',') : undefined,
      priority: q.priority ? q.priority.split(',') : undefined,
      source: q.source ? q.source.split(',') : undefined,
      ownerId: q.ownerId,
      functionId: q.functionId,
      ownedOrCreatedByUserId: q.ownedOrCreatedByUserId,
      dueBefore: q.dueBefore,
      dueAfter: q.dueAfter,
      search: q.search,
      page,
      pageSize,
    });
    res.json({ success: true, data: result.tasks, meta: { page, pageSize, total: result.total } });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getTaskById(req.params.id as string, req.user!.tenantId!);
    if (!data) { res.status(404).json({ success: false, error: 'Task not found' }); return; }
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, description, priority, source, sourceId, sourceModule, ownerId, functionId, dueDate } = req.body;
    if (!title || !ownerId) {
      res.status(400).json({ success: false, error: 'title and ownerId are required' });
      return;
    }
    const data = await createTask({
      tenantId: req.user!.tenantId!,
      title, description, priority, source, sourceId, sourceModule,
      ownerId, functionId, dueDate,
      createdBy: req.user!.id,
    });
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await updateTask(req.params.id as string, req.user!.tenantId!, req.user!.id, req.body);
    if (!data) { res.status(404).json({ success: false, error: 'Task not found' }); return; }
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await softDeleteTask(req.params.id as string, req.user!.tenantId!);
    if (!data) { res.status(404).json({ success: false, error: 'Task not found' }); return; }
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) { next(err); }
});

export default router;
