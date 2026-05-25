// E2.15a: Integration framework — API key management + webhook engine.
// API keys: generate/list/revoke/validate with bcrypt hashing (prefix lookup, never store plaintext).
// Webhooks: in-memory event registry, subscription CRUD, HMAC-signed HTTP delivery with retry.

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import prisma from '../../lib/prisma.js';
import type { WebhookEventDefinition } from '@wings2i-gracie/contracts';

// ─── In-memory webhook event registry ────────────────────────────────────────

const eventRegistry = new Map<string, WebhookEventDefinition[]>();

// ─── API Key functions ────────────────────────────────────────────────────────

// Key format: gk_<8-hex-prefix>_<64-hex-secret>
// Only the prefix is stored in plaintext; the full key is bcrypt-hashed.

export async function generateApiKey(
  tenantId: string,
  name: string,
  scopes: string[],
  expiresAt?: Date,
): Promise<{ key: string; record: ReturnType<typeof mapApiKey> }> {
  const prefix = crypto.randomBytes(4).toString('hex');          // 8 hex chars
  const secret = crypto.randomBytes(32).toString('hex');         // 64 hex chars
  const fullKey = `gk_${prefix}_${secret}`;
  const keyHash = await bcrypt.hash(fullKey, 10);

  const record = await prisma.coreApiKey.create({
    data: {
      tenant_id: tenantId,
      name,
      key_prefix: prefix,
      key_hash: keyHash,
      scopes,
      expires_at: expiresAt,
    },
  });

  return { key: fullKey, record: mapApiKey(record) };
}

export async function listApiKeys(tenantId: string) {
  const keys = await prisma.coreApiKey.findMany({
    where: { tenant_id: tenantId, revoked_at: null },
    orderBy: { created_at: 'desc' },
  });
  return keys.map(mapApiKey);
}

export async function revokeApiKey(tenantId: string, keyId: string): Promise<void> {
  await prisma.coreApiKey.updateMany({
    where: { id: keyId, tenant_id: tenantId },
    data: { revoked_at: new Date() },
  });
}

export async function validateApiKey(
  rawKey: string,
): Promise<{ valid: boolean; tenantId?: string; scopes?: string[] }> {
  const parts = rawKey.split('_');
  if (parts.length < 3 || parts[0] !== 'gk') return { valid: false };
  const prefix = parts[1];

  const candidates = await prisma.coreApiKey.findMany({
    where: { key_prefix: prefix, revoked_at: null },
  });

  const now = new Date();
  for (const k of candidates) {
    if (k.expires_at && k.expires_at < now) continue;
    const match = await bcrypt.compare(rawKey, k.key_hash);
    if (match) {
      await prisma.coreApiKey.update({
        where: { id: k.id },
        data: { last_used_at: now },
      });
      return { valid: true, tenantId: k.tenant_id, scopes: k.scopes as string[] };
    }
  }
  return { valid: false };
}

// ─── Webhook event registry ───────────────────────────────────────────────────

export function registerWebhookEvents(productKey: string, events: WebhookEventDefinition[]): void {
  eventRegistry.set(productKey, events);
}

export function getWebhookEvents(productKey?: string): WebhookEventDefinition[] {
  if (productKey) return eventRegistry.get(productKey) ?? [];
  const all: WebhookEventDefinition[] = [];
  for (const events of eventRegistry.values()) all.push(...events);
  return all;
}

// ─── Webhook subscription functions ──────────────────────────────────────────

export async function createSubscription(
  tenantId: string,
  eventKey: string,
  targetUrl: string,
  secret?: string,
) {
  let productKey = 'unknown';
  for (const [pk, events] of eventRegistry.entries()) {
    if (events.some((e) => e.eventKey === eventKey)) {
      productKey = pk;
      break;
    }
  }

  const sub = await prisma.coreWebhookSubscription.create({
    data: {
      tenant_id: tenantId,
      product_key: productKey,
      event_key: eventKey,
      target_url: targetUrl,
      secret: secret ?? null,
    },
  });
  return mapSubscription(sub);
}

export async function listSubscriptions(tenantId: string) {
  const subs = await prisma.coreWebhookSubscription.findMany({
    where: { tenant_id: tenantId, is_active: true, deleted_at: null },
    orderBy: { created_at: 'desc' },
  });
  return subs.map(mapSubscription);
}

export async function deleteSubscription(tenantId: string, subscriptionId: string): Promise<void> {
  await prisma.coreWebhookSubscription.updateMany({
    where: { id: subscriptionId, tenant_id: tenantId },
    data: { deleted_at: new Date(), is_active: false },
  });
}

export async function listDeliveries(tenantId: string, limit = 50) {
  const deliveries = await prisma.coreWebhookDelivery.findMany({
    where: { tenant_id: tenantId },
    orderBy: { created_at: 'desc' },
    take: limit,
  });
  return deliveries.map(mapDelivery);
}

// ─── Webhook dispatch ─────────────────────────────────────────────────────────

export async function dispatchWebhook(
  tenantId: string,
  eventKey: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const subs = await prisma.coreWebhookSubscription.findMany({
    where: { tenant_id: tenantId, event_key: eventKey, is_active: true, deleted_at: null },
  });

  for (const sub of subs) {
    const delivery = await prisma.coreWebhookDelivery.create({
      data: {
        subscription_id: sub.id,
        tenant_id: tenantId,
        event_key: eventKey,
        payload: payload as object,
        status: 'pending',
      },
    });

    // Fire-and-forget delivery; errors are logged, not propagated to caller
    void deliverWebhook(sub.id, delivery.id, sub.target_url, sub.secret, eventKey, payload);
  }
}

async function deliverWebhook(
  _subscriptionId: string,
  deliveryId: string,
  targetUrl: string,
  secret: string | null,
  eventKey: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const body = JSON.stringify({ eventKey, payload, deliveredAt: new Date().toISOString() });
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-GRACie-Event': eventKey,
  };
  if (secret) {
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    headers['X-GRACie-Signature'] = `sha256=${sig}`;
  }

  const now = new Date();
  let responseStatus: number | null = null;
  let status = 'failed';

  try {
    const resp = await fetch(targetUrl, { method: 'POST', headers, body });
    responseStatus = resp.status;
    status = resp.ok ? 'delivered' : 'failed';
  } catch (err) {
    console.warn(`[core/integration] HTTP delivery failed for ${deliveryId}:`, err);
  }

  const nextRetryAt = status === 'failed' ? new Date(now.getTime() + 5 * 60 * 1000) : null;

  await prisma.coreWebhookDelivery.update({
    where: { id: deliveryId },
    data: {
      status,
      attempt_count: { increment: 1 },
      last_attempt_at: now,
      response_status: responseStatus,
      next_retry_at: nextRetryAt,
    },
  });
}

// ─── Retry failed deliveries (called every 5 minutes from Privacy startup) ───

export async function retryFailedDeliveries(): Promise<void> {
  const now = new Date();
  const failed = await prisma.coreWebhookDelivery.findMany({
    where: {
      status: 'failed',
      attempt_count: { lt: 3 },
      next_retry_at: { lte: now },
    },
    include: { subscription: true },
  });

  for (const d of failed) {
    if (!d.subscription.is_active || d.subscription.deleted_at) continue;
    void deliverWebhook(
      d.subscription_id,
      d.id,
      d.subscription.target_url,
      d.subscription.secret,
      d.event_key,
      d.payload as Record<string, unknown>,
    );
  }
}

// ─── Map helpers ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapApiKey(k: any) {
  return {
    id: k.id as string,
    tenantId: k.tenant_id as string,
    name: k.name as string,
    keyPrefix: k.key_prefix as string,
    scopes: k.scopes as string[],
    lastUsedAt: k.last_used_at ? (k.last_used_at as Date).toISOString() : undefined,
    expiresAt: k.expires_at ? (k.expires_at as Date).toISOString() : undefined,
    revokedAt: k.revoked_at ? (k.revoked_at as Date).toISOString() : undefined,
    createdAt: (k.created_at as Date).toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSubscription(s: any) {
  return {
    id: s.id as string,
    tenantId: s.tenant_id as string,
    productKey: s.product_key as string,
    eventKey: s.event_key as string,
    targetUrl: s.target_url as string,
    active: s.is_active as boolean,
    createdAt: (s.created_at as Date).toISOString(),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDelivery(d: any) {
  return {
    id: d.id as string,
    subscriptionId: d.subscription_id as string,
    tenantId: d.tenant_id as string,
    eventKey: d.event_key as string,
    payload: d.payload as Record<string, unknown>,
    status: d.status as string,
    attemptCount: d.attempt_count as number,
    lastAttemptAt: d.last_attempt_at ? (d.last_attempt_at as Date).toISOString() : undefined,
    nextRetryAt: d.next_retry_at ? (d.next_retry_at as Date).toISOString() : undefined,
    responseStatus: d.response_status as number | null,
    createdAt: (d.created_at as Date).toISOString(),
  };
}
