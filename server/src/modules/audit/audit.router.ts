import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireRole } from '../../middleware/rbac.middleware.js';
import { getAuditLogs, exportAuditLogsAsCsv } from './audit.service.js';

const router = Router();

const auditAccess = requireRole('org_admin', 'compliance_manager', 'auditor', 'super_admin');

router.get('/', auditAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = '1', pageSize = '25', module, userId, from, to } = req.query as Record<string, string>;
    const p = Math.max(1, parseInt(page));
    const ps = Math.min(100, Math.max(1, parseInt(pageSize)));

    const result = await getAuditLogs(
      req.user!.tenantId!,
      { module, userId, from, to },
      { page: p, pageSize: ps },
    );

    res.json({
      success: true,
      data: result.logs,
      meta: { page: result.page, pageSize: result.pageSize, total: result.total },
    });
  } catch (err) { next(err); }
});

router.get('/export', auditAccess, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { module, userId, from, to } = req.query as Record<string, string>;
    const csv = await exportAuditLogsAsCsv(req.user!.tenantId!, { module, userId, from, to });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');
    res.send(csv);
  } catch (err) { next(err); }
});

export default router;
