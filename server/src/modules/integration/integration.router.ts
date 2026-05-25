// E2.15a/b: Integration router — mounted at /api/v1/core/integrations in Privacy.
// E2.15a: API key CRUD, webhook events, subscriptions, deliveries.
// E2.15b: OAuth client credentials, OpenAPI composition endpoint, integration audit log.

import { Router, type Request, type Response } from 'express';
import { requireAuth, requireTenant } from '../../middleware/auth.middleware.js';
import { requireRole } from '../../middleware/rbac.middleware.js';
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
import {
  createOAuthClient,
  listOAuthClients,
  revokeOAuthClient,
  issueClientCredentialsToken,
} from './oauth.service.js';
import { rateLimitByApiKey, rateLimitByOAuthClient } from './rateLimiter.middleware.js';
import { requireIdempotency } from './idempotency.middleware.js';
import { getComposedSpec } from './openapi.service.js';
import { logIntegrationRequest, getIntegrationAudit } from './integrationAudit.service.js';

const router = Router();

// ── API Keys ─────────────────────────────────────────────────── (auth required) ──

// POST /keys — generate a new API key (full key returned once, never again)
router.post(
  '/keys',
  requireAuth,
  requireTenant,
  rateLimitByApiKey,
  requireIdempotency,
  async (req: Request, res: Response): Promise<void> => {
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
      logIntegrationRequest({
        tenantId,
        actorType: 'user',
        actorId: req.user!.id,
        action: 'api_key.create',
        resourceType: 'api_key',
        resourceId: result.record.id,
        statusCode: 201,
        ipAddress: req.ip,
      });
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      console.error('[core/integrations] POST /keys error:', err);
      res.status(500).json({ success: false, error: 'Failed to generate API key', code: 'SERVER_ERROR' });
    }
  },
);

// GET /keys — list API keys for tenant (no hashes or full keys returned)
router.get(
  '/keys',
  requireAuth,
  requireTenant,
  rateLimitByApiKey,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = req.user!.tenantId!;
      const keys = await listApiKeys(tenantId);
      res.json({ success: true, data: keys });
    } catch (err) {
      console.error('[core/integrations] GET /keys error:', err);
      res.status(500).json({ success: false, error: 'Failed to list API keys', code: 'SERVER_ERROR' });
    }
  },
);

// DELETE /keys/:keyId — revoke an API key
router.delete(
  '/keys/:keyId',
  requireAuth,
  requireTenant,
  rateLimitByApiKey,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = req.user!.tenantId!;
      const keyId = req.params.keyId as string;
      await revokeApiKey(tenantId, keyId);
      logIntegrationRequest({
        tenantId,
        actorType: 'user',
        actorId: req.user!.id,
        action: 'api_key.revoke',
        resourceType: 'api_key',
        resourceId: keyId,
        statusCode: 200,
        ipAddress: req.ip,
      });
      res.json({ success: true });
    } catch (err) {
      console.error('[core/integrations] DELETE /keys/:keyId error:', err);
      res.status(500).json({ success: false, error: 'Failed to revoke API key', code: 'SERVER_ERROR' });
    }
  },
);

// ── Webhook events ────────────────────────────────────────────────────────────

// GET /webhooks/events — list registered event definitions
router.get('/webhooks/events', requireAuth, requireTenant, async (req: Request, res: Response): Promise<void> => {
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
router.post(
  '/webhooks/subscriptions',
  requireAuth,
  requireTenant,
  requireIdempotency,
  async (req: Request, res: Response): Promise<void> => {
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
  },
);

// GET /webhooks/subscriptions — list active subscriptions for tenant
router.get('/webhooks/subscriptions', requireAuth, requireTenant, async (req: Request, res: Response): Promise<void> => {
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
router.delete('/webhooks/subscriptions/:id', requireAuth, requireTenant, async (req: Request, res: Response): Promise<void> => {
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
router.get('/webhooks/deliveries', requireAuth, requireTenant, async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = req.user!.tenantId!;
    const deliveries = await listDeliveries(tenantId);
    res.json({ success: true, data: deliveries });
  } catch (err) {
    console.error('[core/integrations] GET /webhooks/deliveries error:', err);
    res.status(500).json({ success: false, error: 'Failed to list deliveries', code: 'SERVER_ERROR' });
  }
});

// ── OAuth client credentials ──────────────────────────────────────────────────

// POST /oauth/clients — create OAuth client (returns secret once)
router.post(
  '/oauth/clients',
  requireAuth,
  requireTenant,
  rateLimitByOAuthClient,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = req.user!.tenantId!;
      const { name, scopes = [], grantTypes } = req.body as {
        name: string;
        scopes?: string[];
        grantTypes?: string[];
      };
      if (!name) {
        res.status(400).json({ success: false, error: 'name is required', code: 'MISSING_FIELDS' });
        return;
      }
      const result = await createOAuthClient(tenantId, name, scopes, grantTypes);
      logIntegrationRequest({
        tenantId,
        actorType: 'user',
        actorId: req.user!.id,
        action: 'oauth_client.create',
        resourceType: 'oauth_client',
        resourceId: result.record.id,
        statusCode: 201,
        ipAddress: req.ip,
      });
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      console.error('[core/integrations] POST /oauth/clients error:', err);
      res.status(500).json({ success: false, error: 'Failed to create OAuth client', code: 'SERVER_ERROR' });
    }
  },
);

// GET /oauth/clients — list OAuth clients for tenant
router.get(
  '/oauth/clients',
  requireAuth,
  requireTenant,
  rateLimitByOAuthClient,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = req.user!.tenantId!;
      const clients = await listOAuthClients(tenantId);
      res.json({ success: true, data: clients });
    } catch (err) {
      console.error('[core/integrations] GET /oauth/clients error:', err);
      res.status(500).json({ success: false, error: 'Failed to list OAuth clients', code: 'SERVER_ERROR' });
    }
  },
);

// DELETE /oauth/clients/:id — revoke an OAuth client
router.delete(
  '/oauth/clients/:id',
  requireAuth,
  requireTenant,
  rateLimitByOAuthClient,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = req.user!.tenantId!;
      const clientId = req.params.id as string;
      await revokeOAuthClient(tenantId, clientId);
      logIntegrationRequest({
        tenantId,
        actorType: 'user',
        actorId: req.user!.id,
        action: 'oauth_client.revoke',
        resourceType: 'oauth_client',
        resourceId: clientId,
        statusCode: 200,
        ipAddress: req.ip,
      });
      res.json({ success: true });
    } catch (err) {
      console.error('[core/integrations] DELETE /oauth/clients/:id error:', err);
      res.status(500).json({ success: false, error: 'Failed to revoke OAuth client', code: 'SERVER_ERROR' });
    }
  },
);

// POST /oauth/token — issue access token (no JWT auth — uses clientId + clientSecret)
router.post('/oauth/token', async (req: Request, res: Response): Promise<void> => {
  try {
    const { clientId, clientSecret, scope } = req.body as {
      clientId: string;
      clientSecret: string;
      scope?: string;
    };
    if (!clientId || !clientSecret) {
      res.status(400).json({ success: false, error: 'clientId and clientSecret are required', code: 'MISSING_FIELDS' });
      return;
    }
    const requestedScopes = scope ? scope.split(' ').filter(Boolean) : [];
    const result = await issueClientCredentialsToken(clientId, clientSecret, requestedScopes);
    if (!result) {
      res.status(401).json({ success: false, error: 'Invalid client credentials', code: 'UNAUTHORIZED' });
      return;
    }
    res.json({
      access_token: result.accessToken,
      token_type: 'Bearer',
      expires_in: result.expiresIn,
      scope: result.scopes.join(' '),
    });
  } catch (err) {
    console.error('[core/integrations] POST /oauth/token error:', err);
    res.status(500).json({ success: false, error: 'Failed to issue token', code: 'SERVER_ERROR' });
  }
});

// ── OpenAPI ───────────────────────────────────────────────────────────────────

// GET /openapi — returns merged OpenAPI 3.0 spec (no auth — public spec endpoint)
router.get('/openapi', (_req: Request, res: Response): void => {
  res.json(getComposedSpec());
});

// ── Integration audit log ─────────────────────────────────────────────────────

// GET /audit — paginated audit log (org_admin and above only)
router.get(
  '/audit',
  requireAuth,
  requireTenant,
  requireRole('org_admin', 'super_admin'),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const tenantId = req.user!.tenantId!;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 50;
      const actorType = req.query.actorType as string | undefined;
      const from = req.query.from ? new Date(req.query.from as string) : undefined;
      const to = req.query.to ? new Date(req.query.to as string) : undefined;

      const result = await getIntegrationAudit(tenantId, { page, pageSize, actorType, from, to });
      res.json({ success: true, ...result });
    } catch (err) {
      console.error('[core/integrations] GET /audit error:', err);
      res.status(500).json({ success: false, error: 'Failed to retrieve audit log', code: 'SERVER_ERROR' });
    }
  },
);

export default router;
