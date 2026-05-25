// E2.15a: Integration router — mounted at /api/v1/core/integrations in Privacy.

import { Router, type Request, type Response } from 'express';
import { requireAuth, requireTenant } from '../../middleware/auth.middleware.js';
import {
  generateApiKey,
  listApiKeys,
  revokeApiKey,
  getWebhookEvents,
  createSubscription,
  listSubscriptions,
  deleteSubscription,
  listDeliveries,
} from './integration.service.js';

const router = Router();

router.use(requireAuth, requireTenant);

// ── API Keys ──────────────────────────────────────────────────────────────────

// POST /keys — generate a new API key (full key returned once, never again)
router.post('/keys', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId!;
    const { name, scopes = [], expiresAt } = req.body as {
      name: string;
      scopes?: string[];
      expiresAt?: string;
    };
    if (!name) {
      res.status(400).json({ success: false, error: 'name is required', code: 'MISSING_FIELDS' });
      return;
    }
    const result = await generateApiKey(
      tenantId,
      name,
      scopes,
      expiresAt ? new Date(expiresAt) : undefined,
    );
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    console.error('[core/integrations] POST /keys error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate API key', code: 'SERVER_ERROR' });
  }
});

// GET /keys — list API keys for tenant (no hashes or full keys returned)
router.get('/keys', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId!;
    const keys = await listApiKeys(tenantId);
    res.json({ success: true, data: keys });
  } catch (err) {
    console.error('[core/integrations] GET /keys error:', err);
    res.status(500).json({ success: false, error: 'Failed to list API keys', code: 'SERVER_ERROR' });
  }
});

// DELETE /keys/:keyId — revoke an API key
router.delete('/keys/:keyId', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId!;
    const keyId = req.params.keyId as string;
    await revokeApiKey(tenantId, keyId);
    res.json({ success: true });
  } catch (err) {
    console.error('[core/integrations] DELETE /keys/:keyId error:', err);
    res.status(500).json({ success: false, error: 'Failed to revoke API key', code: 'SERVER_ERROR' });
  }
});

// ── Webhook events ────────────────────────────────────────────────────────────

// GET /webhooks/events — list registered event definitions
router.get('/webhooks/events', async (req: Request, res: Response): Promise<void> => {
  try {
    const productKey = req.query.productKey as string | undefined;
    const events = getWebhookEvents(productKey);
    res.json({ success: true, data: events });
  } catch (err) {
    console.error('[core/integrations] GET /webhooks/events error:', err);
    res.status(500).json({ success: false, error: 'Failed to list webhook events', code: 'SERVER_ERROR' });
  }
});

// ── Webhook subscriptions ─────────────────────────────────────────────────────

// POST /webhooks/subscriptions — create a webhook subscription
router.post('/webhooks/subscriptions', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId!;
    const { eventKey, targetUrl, secret } = req.body as {
      eventKey: string;
      targetUrl: string;
      secret?: string;
    };
    if (!eventKey || !targetUrl) {
      res.status(400).json({ success: false, error: 'eventKey and targetUrl are required', code: 'MISSING_FIELDS' });
      return;
    }
    const sub = await createSubscription(tenantId, eventKey, targetUrl, secret);
    res.status(201).json({ success: true, data: sub });
  } catch (err) {
    console.error('[core/integrations] POST /webhooks/subscriptions error:', err);
    res.status(500).json({ success: false, error: 'Failed to create subscription', code: 'SERVER_ERROR' });
  }
});

// GET /webhooks/subscriptions — list active subscriptions for tenant
router.get('/webhooks/subscriptions', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId!;
    const subs = await listSubscriptions(tenantId);
    res.json({ success: true, data: subs });
  } catch (err) {
    console.error('[core/integrations] GET /webhooks/subscriptions error:', err);
    res.status(500).json({ success: false, error: 'Failed to list subscriptions', code: 'SERVER_ERROR' });
  }
});

// DELETE /webhooks/subscriptions/:id — soft-delete a subscription
router.delete('/webhooks/subscriptions/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId!;
    const subscriptionId = req.params.id as string;
    await deleteSubscription(tenantId, subscriptionId);
    res.json({ success: true });
  } catch (err) {
    console.error('[core/integrations] DELETE /webhooks/subscriptions/:id error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete subscription', code: 'SERVER_ERROR' });
  }
});

// ── Webhook deliveries ────────────────────────────────────────────────────────

// GET /webhooks/deliveries — list recent delivery records for tenant
router.get('/webhooks/deliveries', async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId!;
    const deliveries = await listDeliveries(tenantId);
    res.json({ success: true, data: deliveries });
  } catch (err) {
    console.error('[core/integrations] GET /webhooks/deliveries error:', err);
    res.status(500).json({ success: false, error: 'Failed to list deliveries', code: 'SERVER_ERROR' });
  }
});

export default router;
