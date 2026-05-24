// E2.9: Core AI configuration and usage API routes
// Mounted at /api/v1/core/ai in Privacy app.ts

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, requireTenant } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
import * as aiService from './ai.service.js';
import prisma from '../../lib/prisma.js';

const router = Router();
const orgAdminOnly = requireRole('org_admin', 'super_admin');

// GET /config — get masked AI config for the authenticated tenant
router.get(
  '/config',
  requireAuth,
  requireTenant,
  orgAdminOnly,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.user!.tenantId as string;
      const config = await aiService.getAiConfig(tenantId);
      res.json({ success: true, data: config ?? { isUsingTenantKey: false } });
    } catch (err) { next(err); }
  },
);

// POST /config — save AI config for the authenticated tenant
router.post(
  '/config',
  requireAuth,
  requireTenant,
  orgAdminOnly,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.user!.tenantId as string;
      const userId = req.user!.id as string;
      const { provider, model, apiKey, azureEndpoint, azureDeploymentName,
        localLlmBaseUrl, localLlmModelName, localLlmApiKeyRequired, spendCapUsd } = req.body as Record<string, string | boolean | number | undefined>;

      if (!provider || !model) {
        res.status(400).json({ success: false, error: 'provider and model are required', code: 'MISSING_FIELDS' });
        return;
      }

      const result = await aiService.saveAiConfig(tenantId, userId, {
        provider: provider as string,
        model: model as string,
        apiKey: (apiKey ?? '') as string,
        azureEndpoint: azureEndpoint as string | undefined,
        azureDeploymentName: azureDeploymentName as string | undefined,
        localLlmBaseUrl: localLlmBaseUrl as string | undefined,
        localLlmModelName: localLlmModelName as string | undefined,
        localLlmApiKeyRequired: localLlmApiKeyRequired as boolean | undefined,
        spendCapUsd: spendCapUsd as number | undefined,
      });
      res.json({ success: true, data: result });
    } catch (err) { next(err); }
  },
);

// DELETE /config — remove AI config for the authenticated tenant
router.delete(
  '/config',
  requireAuth,
  requireTenant,
  orgAdminOnly,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.user!.tenantId as string;
      await aiService.removeAiConfig(tenantId);
      res.json({ success: true, data: { removed: true } });
    } catch (err) { next(err); }
  },
);

// GET /config/status — admin status check (no key decryption)
router.get(
  '/config/status',
  requireAuth,
  requireTenant,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.user!.tenantId as string;
      const status = await aiService.getAiConfigStatusForAdmin(tenantId);
      res.json({ success: true, data: status });
    } catch (err) { next(err); }
  },
);

// GET /usage — AI usage logs for the authenticated tenant
// Query params: ?from=ISO&to=ISO&feature=string
router.get(
  '/usage',
  requireAuth,
  requireTenant,
  orgAdminOnly,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const tenantId = req.user!.tenantId as string;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = Math.min(parseInt(req.query.pageSize as string) || 25, 100);
      const { feature, from, to } = req.query as Record<string, string | undefined>;

      const where: Record<string, unknown> = { tenant_id: tenantId };
      if (feature) where.feature = feature;
      if (from || to) {
        const range: Record<string, Date> = {};
        if (from) range.gte = new Date(from);
        if (to) range.lte = new Date(to);
        where.created_at = range;
      }

      const [total, rows] = await Promise.all([
        prisma.coreAiUsageLog.count({ where }),
        prisma.coreAiUsageLog.findMany({
          where,
          orderBy: { created_at: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);

      res.json({
        success: true,
        data: {
          total,
          page,
          pageSize,
          items: rows.map((r) => ({
            id: r.id,
            scope: r.scope,
            feature: r.feature,
            provider: r.provider,
            model: r.model,
            inputTokens: r.input_tokens,
            outputTokens: r.output_tokens,
            totalTokens: r.total_tokens,
            estimatedCostUsd: r.estimated_cost_usd != null
              ? parseFloat(r.estimated_cost_usd.toString())
              : null,
            latencyMs: r.latency_ms,
            status: r.status,
            errorCode: r.error_code,
            createdAt: r.created_at.toISOString(),
          })),
        },
      });
    } catch (err) { next(err); }
  },
);

export default router;
