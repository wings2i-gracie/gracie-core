// E2.15b: OAuth client credentials issuer — M2M tokens for tenant integrations.
// Flow: create client (get secret once) → POST /oauth/token with clientId+secret → JWT access token.
// Tokens are JWTs signed with CORE_OAUTH_SECRET; the token hash is stored for revocation checks.

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma.js';

const OAUTH_SECRET = process.env.CORE_OAUTH_SECRET ?? process.env.JWT_ACCESS_SECRET ?? 'gracie-oauth-secret';
const TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes

// ── Client management ─────────────────────────────────────────────────────────

export async function createOAuthClient(
  tenantId: string,
  name: string,
  scopes: string[],
  grantTypes: string[] = ['client_credentials'],
): Promise<{ clientId: string; clientSecret: string; record: ReturnType<typeof mapClient> }> {
  const rawClientId = `gc_${crypto.randomBytes(12).toString('hex')}`;
  const rawSecret = crypto.randomBytes(32).toString('hex');
  const secretHash = await bcrypt.hash(rawSecret, 10);

  const record = await prisma.coreOAuthClient.create({
    data: {
      tenant_id: tenantId,
      client_id: rawClientId,
      client_secret_hash: secretHash,
      name,
      scopes,
      grant_types: grantTypes,
    },
  });

  return { clientId: rawClientId, clientSecret: rawSecret, record: mapClient(record) };
}

export async function listOAuthClients(tenantId: string) {
  const clients = await prisma.coreOAuthClient.findMany({
    where: { tenant_id: tenantId, revoked_at: null, deleted_at: null },
    orderBy: { created_at: 'desc' },
  });
  return clients.map(mapClient);
}

export async function revokeOAuthClient(tenantId: string, clientId: string): Promise<void> {
  await prisma.coreOAuthClient.updateMany({
    where: { id: clientId, tenant_id: tenantId },
    data: { revoked_at: new Date() },
  });
}

// ── Token issuance ────────────────────────────────────────────────────────────

export async function issueClientCredentialsToken(
  rawClientId: string,
  clientSecret: string,
  requestedScopes: string[],
): Promise<{ accessToken: string; expiresIn: number; scopes: string[] } | null> {
  const client = await prisma.coreOAuthClient.findUnique({
    where: { client_id: rawClientId },
  });

  if (!client || client.revoked_at || client.deleted_at) return null;
  if (!client.grant_types.includes('client_credentials')) return null;

  const secretMatch = await bcrypt.compare(clientSecret, client.client_secret_hash);
  if (!secretMatch) return null;

  // Intersect requested scopes with permitted client scopes
  const grantedScopes =
    requestedScopes.length > 0
      ? requestedScopes.filter((s) => (client.scopes as string[]).includes(s))
      : (client.scopes as string[]);

  const now = Math.floor(Date.now() / 1000);
  const exp = now + TOKEN_TTL_SECONDS;

  const payload = {
    sub: client.id,
    cid: rawClientId,
    tid: client.tenant_id,
    scopes: grantedScopes,
    iat: now,
    exp,
    type: 'oauth_cc',
  };

  const accessToken = jwt.sign(payload, OAUTH_SECRET);
  const tokenHash = crypto.createHash('sha256').update(accessToken).digest('hex');

  await prisma.coreOAuthToken.create({
    data: {
      client_id: client.id,
      tenant_id: client.tenant_id,
      access_token_hash: tokenHash,
      scopes: grantedScopes,
      expires_at: new Date(exp * 1000),
    },
  });

  return { accessToken, expiresIn: TOKEN_TTL_SECONDS, scopes: grantedScopes };
}

// ── Token validation ──────────────────────────────────────────────────────────

export async function validateOAuthToken(
  rawToken: string,
): Promise<{ valid: boolean; tenantId?: string; scopes?: string[] }> {
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(rawToken, OAUTH_SECRET) as jwt.JwtPayload;
  } catch {
    return { valid: false };
  }

  if (payload.type !== 'oauth_cc') return { valid: false };

  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const stored = await prisma.coreOAuthToken.findFirst({
    where: { access_token_hash: tokenHash, revoked_at: null },
  });

  if (!stored || stored.expires_at < new Date()) return { valid: false };

  return { valid: true, tenantId: payload.tid as string, scopes: payload.scopes as string[] };
}

// ── Map helper ────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapClient(c: any) {
  return {
    id: c.id as string,
    tenantId: c.tenant_id as string,
    clientId: c.client_id as string,
    name: c.name as string,
    scopes: c.scopes as string[],
    grantTypes: c.grant_types as string[],
    active: !c.revoked_at,
    createdAt: (c.created_at as Date).toISOString(),
    revokedAt: c.revoked_at ? (c.revoked_at as Date).toISOString() : undefined,
  };
}
