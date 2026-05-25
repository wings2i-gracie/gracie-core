// E2.14: Reporting engine router — mounted at /api/v1/core/reporting in Privacy.

import { Router, type Request, type Response } from 'express';
import { requireAuth, requireTenant } from '../../middleware/auth.middleware.js';
import {
  getRegisteredTemplates,
  listReportRuns,
  getReportRunStatus,
  listSchedules,
  createSchedule,
  deleteSchedule,
} from './reporting.service.js';

const router = Router();

router.use(requireAuth, requireTenant);

// GET /templates — list registered report templates (optionally filter by productKey)
router.get('/templates', async (req: Request, res: Response): Promise<void> => {
  try {
    const productKey = req.query.productKey as string | undefined;
    const templates = getRegisteredTemplates(productKey);
    res.json({ success: true, data: templates });
  } catch (err) {
    console.error('[core/reporting] GET /templates error:', err);
    res.status(500).json({ success: false, error: 'Failed to list templates', code: 'SERVER_ERROR' });
  }
});

// GET /runs — list report runs for tenant
router.get('/runs', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId!;
    const page = parseInt(String(req.query.page ?? '1'), 10);
    const pageSize = parseInt(String(req.query.pageSize ?? '25'), 10);
    const result = await listReportRuns(tenantId, page, pageSize);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[core/reporting] GET /runs error:', err);
    res.status(500).json({ success: false, error: 'Failed to list report runs', code: 'SERVER_ERROR' });
  }
});

// GET /runs/:id/status — poll async job status
router.get('/runs/:id/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId!;
    const runId = req.params.id as string;
    const status = await getReportRunStatus(tenantId, runId);
    if (!status) {
      res.status(404).json({ success: false, error: 'Run not found', code: 'NOT_FOUND' });
      return;
    }
    res.json({ success: true, data: status });
  } catch (err) {
    console.error('[core/reporting] GET /runs/:id/status error:', err);
    res.status(500).json({ success: false, error: 'Failed to get run status', code: 'SERVER_ERROR' });
  }
});

// GET /schedule — list scheduled reports for tenant
router.get('/schedule', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId!;
    const schedules = await listSchedules(tenantId);
    res.json({ success: true, data: schedules });
  } catch (err) {
    console.error('[core/reporting] GET /schedule error:', err);
    res.status(500).json({ success: false, error: 'Failed to list schedules', code: 'SERVER_ERROR' });
  }
});

// POST /schedule — create a scheduled report
router.post('/schedule', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId!;
    const userId = req.user!.id;
    const { reportType, title, scope = {}, format, frequency, recipients = [] } = req.body as {
      reportType: string;
      title: string;
      scope?: Record<string, unknown>;
      format: string;
      frequency: string;
      recipients?: string[];
    };
    if (!reportType || !title || !format || !frequency) {
      res.status(400).json({ success: false, error: 'reportType, title, format and frequency required', code: 'MISSING_FIELDS' });
      return;
    }
    const schedule = await createSchedule({ tenantId, createdBy: userId, reportType, title, scope, format, frequency, recipients });
    res.status(201).json({ success: true, data: schedule });
  } catch (err) {
    console.error('[core/reporting] POST /schedule error:', err);
    res.status(500).json({ success: false, error: 'Failed to create schedule', code: 'SERVER_ERROR' });
  }
});

// DELETE /schedule/:scheduleId — soft-delete a scheduled report
router.delete('/schedule/:scheduleId', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId!;
    const scheduleId = req.params.scheduleId as string;
    await deleteSchedule(tenantId, scheduleId);
    res.json({ success: true });
  } catch (err) {
    console.error('[core/reporting] DELETE /schedule/:scheduleId error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete schedule', code: 'SERVER_ERROR' });
  }
});

export default router;
