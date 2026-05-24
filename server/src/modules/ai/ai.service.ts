/**
 * E2.9: AI Configuration + Usage Logging service.
 *
 * Call sites (Privacy shims delegate to these):
 *   - getAiConfig / saveAiConfig / removeAiConfig / resolveAiCredentials / getAiConfigStatusForAdmin
 *     ← replaces server/src/modules/admin/aiConfig.service.ts
 *   - logAiUsage / estimateCost / LogAiUsageParams
 *     ← replaces server/src/services/aiUsage.service.ts
 *   - aiComplete ← new unified completion helper
 *
 * Strangler bridge:
 *   saveAiConfig  mirrors to tenant_settings.ai_config   (legacy Privacy JSONB field)
 *   removeAiConfig clears tenant_settings.ai_config
 *   resolveAiCredentials reads core table first, falls back to tenant_settings.ai_config
 *   logAiUsage mirrors to ai_usage_logs                  (legacy Privacy table)
 */

import crypto from 'crypto';
import prisma from '../../lib/prisma.js';
import { CoreAiProvider } from '../../generated/prisma-client/index.js';
import type { CoreAiConfig, CoreAiCompleteParams, CoreAiCompleteResult } from '@wings2i-gracie/contracts';

// ─── Encryption ──────────────────────────────────────────────────────────────
// Same algorithm as Privacy's server/src/lib/encryption.ts so keys encrypted
// by either codebase are interchangeable.

const ALGORITHM = 'aes-256-gcm';

function getDerivedKey(): Buffer {
  const secret = process.env.AI_CONFIG_ENCRYPTION_KEY;
  if (!secret) throw new Error('AI_CONFIG_ENCRYPTION_KEY not set in environment');
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptApiKey(plaintext: string): { encrypted: string; iv: string } {
  if (!plaintext) return { encrypted: '', iv: '' };
  const key = getDerivedKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = (cipher as crypto.CipherGCM).getAuthTag();
  const combined = Buffer.concat([tag, encrypted]);
  return { encrypted: combined.toString('base64'), iv: iv.toString('base64') };
}

function decryptApiKey(encryptedBase64: string, ivBase64: string): string {
  if (!encryptedBase64 || !ivBase64) return '';
  const key = getDerivedKey();
  const iv = Buffer.from(ivBase64, 'base64');
  const combined = Buffer.from(encryptedBase64, 'base64');
  const tag = combined.subarray(0, 16);
  const data = combined.subarray(16);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  (decipher as crypto.DecipherGCM).setAuthTag(tag);
  return decipher.update(data).toString('utf8') + decipher.final('utf8');
}

function maskApiKey(plaintext: string): string {
  if (plaintext.length <= 8) return '••••••••';
  return `${'•'.repeat(16)}${plaintext.slice(-4)}`;
}

// ─── Pricing table (cost estimation) ─────────────────────────────────────────

const PRICE_TABLE: Record<string, { input: number; output: number }> = {
  'claude-opus-4-7':           { input: 15.00, output: 75.00 },
  'claude-opus-4-5':           { input: 15.00, output: 75.00 },
  'claude-sonnet-4-6':         { input: 3.00,  output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80,  output: 4.00  },
  'claude-haiku-4-5':          { input: 0.80,  output: 4.00  },
  'gpt-4o':                    { input: 5.00,  output: 15.00 },
  'gpt-4o-mini':               { input: 0.15,  output: 0.60  },
  'gpt-4-turbo':               { input: 10.00, output: 30.00 },
  'gpt-3.5-turbo':             { input: 0.50,  output: 1.50  },
};

export function estimateCost(
  model: string,
  inputTokens?: number,
  outputTokens?: number,
): number | undefined {
  const prices = PRICE_TABLE[model];
  if (!prices || inputTokens == null || outputTokens == null) return undefined;
  return (inputTokens * prices.input + outputTokens * prices.output) / 1_000_000;
}

// ─── Input types ─────────────────────────────────────────────────────────────

export interface AiConfigSaveInput {
  provider: string;
  model: string;
  apiKey: string;
  azureEndpoint?: string;
  azureDeploymentName?: string;
  localLlmBaseUrl?: string;
  localLlmModelName?: string;
  localLlmApiKeyRequired?: boolean;
  spendCapUsd?: number;
}

export interface LogAiUsageParams {
  tenantId?: string | null;
  userId?: string | null;
  scope: 'tenant' | 'super_admin';
  feature: string;
  provider: string;
  model: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  status: 'success' | 'error';
  errorCode?: string | null;
  requestId?: string | null;
}

// ─── AI Config functions ──────────────────────────────────────────────────────

export async function getAiConfig(tenantId: string): Promise<CoreAiConfig | null> {
  const row = await prisma.coreAiTenantConfig.findUnique({ where: { tenant_id: tenantId } });
  if (row) {
    const plainKey = row.api_key ? decryptApiKey(row.api_key, row.iv) : '';
    return {
      provider: row.provider as string as CoreAiConfig['provider'],
      model: row.provider === CoreAiProvider.local_llm
        ? (row.local_llm_model_name ?? 'custom')
        : row.model,
      maskedApiKey: plainKey ? maskApiKey(plainKey) : '(no key)',
      azureEndpoint: row.azure_endpoint ?? undefined,
      azureDeploymentName: row.azure_deployment_name ?? undefined,
      localLlmBaseUrl: row.local_llm_base_url ?? undefined,
      localLlmModelName: row.local_llm_model_name ?? undefined,
      localLlmApiKeyRequired: row.local_llm_api_key_req,
      configuredAt: row.configured_at.toISOString(),
      isUsingTenantKey: true,
    };
  }

  // Fall back to legacy tenant_settings.ai_config
  const legacy = await prisma.$queryRaw<Array<{ ai_config: unknown }>>`
    SELECT ai_config FROM tenant_settings WHERE tenant_id = ${tenantId}::uuid LIMIT 1
  `;
  if (!legacy[0]?.ai_config) return null;

  const stored = legacy[0].ai_config as Record<string, string>;
  const plainKey = stored.encryptedApiKey
    ? decryptApiKey(stored.encryptedApiKey, stored.iv)
    : '';
  return {
    provider: stored.provider as CoreAiConfig['provider'],
    model: stored.provider === 'local_llm' ? (stored.localLlmModelName ?? 'custom') : stored.model,
    maskedApiKey: plainKey ? maskApiKey(plainKey) : '(no key)',
    azureEndpoint: stored.azureEndpoint,
    azureDeploymentName: stored.azureDeploymentName,
    localLlmBaseUrl: stored.localLlmBaseUrl,
    localLlmModelName: stored.localLlmModelName,
    localLlmApiKeyRequired: stored.localLlmApiKeyRequired === 'true',
    configuredAt: stored.configuredAt ?? new Date().toISOString(),
    isUsingTenantKey: true,
  };
}

export async function saveAiConfig(
  tenantId: string,
  userId: string,
  data: AiConfigSaveInput,
): Promise<CoreAiConfig> {
  const apiKeyToEncrypt = data.apiKey || '';
  const { encrypted, iv } = encryptApiKey(apiKeyToEncrypt);
  const provider = data.provider as CoreAiProvider;

  await prisma.coreAiTenantConfig.upsert({
    where: { tenant_id: tenantId },
    update: {
      provider,
      api_key: encrypted,
      iv,
      model: data.model,
      azure_endpoint: data.azureEndpoint ?? null,
      azure_deployment_name: data.azureDeploymentName ?? null,
      local_llm_base_url: data.localLlmBaseUrl ?? null,
      local_llm_model_name: data.localLlmModelName ?? null,
      local_llm_api_key_req: data.localLlmApiKeyRequired ?? false,
      spend_cap_usd: data.spendCapUsd ?? null,
      configured_at: new Date(),
      configured_by: userId,
    },
    create: {
      tenant_id: tenantId,
      provider,
      api_key: encrypted,
      iv,
      model: data.model,
      azure_endpoint: data.azureEndpoint ?? null,
      azure_deployment_name: data.azureDeploymentName ?? null,
      local_llm_base_url: data.localLlmBaseUrl ?? null,
      local_llm_model_name: data.localLlmModelName ?? null,
      local_llm_api_key_req: data.localLlmApiKeyRequired ?? false,
      spend_cap_usd: data.spendCapUsd ?? null,
      configured_by: userId,
    },
  });

  // Strangler bridge: mirror to legacy tenant_settings.ai_config JSONB
  const legacyStored = JSON.stringify({
    provider: data.provider,
    model: data.model,
    encryptedApiKey: encrypted,
    iv,
    azureEndpoint: data.azureEndpoint,
    azureDeploymentName: data.azureDeploymentName,
    localLlmBaseUrl: data.localLlmBaseUrl,
    localLlmModelName: data.localLlmModelName,
    localLlmApiKeyRequired: data.localLlmApiKeyRequired,
    configuredAt: new Date().toISOString(),
    configuredBy: userId,
  });
  await prisma.$executeRaw`
    INSERT INTO tenant_settings (tenant_id, ai_config)
    VALUES (${tenantId}::uuid, ${legacyStored}::jsonb)
    ON CONFLICT (tenant_id) DO UPDATE SET ai_config = EXCLUDED.ai_config
  `;

  return {
    provider: data.provider as CoreAiConfig['provider'],
    model: data.provider === 'local_llm' ? (data.localLlmModelName ?? 'custom') : data.model,
    maskedApiKey: apiKeyToEncrypt ? maskApiKey(apiKeyToEncrypt) : '(no key)',
    azureEndpoint: data.azureEndpoint,
    azureDeploymentName: data.azureDeploymentName,
    localLlmBaseUrl: data.localLlmBaseUrl,
    localLlmModelName: data.localLlmModelName,
    localLlmApiKeyRequired: data.localLlmApiKeyRequired,
    configuredAt: new Date().toISOString(),
    isUsingTenantKey: true,
  };
}

export async function removeAiConfig(tenantId: string): Promise<void> {
  // Delete from Core table (ignore if not found)
  await prisma.coreAiTenantConfig.deleteMany({ where: { tenant_id: tenantId } });

  // Mirror: clear legacy tenant_settings.ai_config
  await prisma.$executeRaw`
    UPDATE tenant_settings SET ai_config = NULL WHERE tenant_id = ${tenantId}::uuid
  `;
}

export async function resolveAiCredentials(tenantId: string): Promise<{
  provider: string;
  model: string;
  apiKey: string;
  azureEndpoint?: string;
  azureDeploymentName?: string;
  localLlmBaseUrl?: string;
  localLlmModelName?: string;
  source: 'tenant' | 'server';
}> {
  // 1. Core table
  const coreRow = await prisma.coreAiTenantConfig.findUnique({ where: { tenant_id: tenantId } });
  if (coreRow && coreRow.api_key) {
    const apiKey = decryptApiKey(coreRow.api_key, coreRow.iv);
    if (coreRow.provider === CoreAiProvider.local_llm) {
      return {
        provider: 'local_llm',
        model: coreRow.local_llm_model_name ?? 'custom',
        apiKey,
        localLlmBaseUrl: coreRow.local_llm_base_url ?? undefined,
        localLlmModelName: coreRow.local_llm_model_name ?? undefined,
        source: 'tenant',
      };
    }
    return {
      provider: coreRow.provider as string,
      model: coreRow.model,
      apiKey,
      azureEndpoint: coreRow.azure_endpoint ?? undefined,
      azureDeploymentName: coreRow.azure_deployment_name ?? undefined,
      source: 'tenant',
    };
  }

  // 2. Legacy tenant_settings.ai_config (backward compat for tenants not yet migrated to Core)
  const legacy = await prisma.$queryRaw<Array<{ ai_config: unknown }>>`
    SELECT ai_config FROM tenant_settings WHERE tenant_id = ${tenantId}::uuid LIMIT 1
  `;
  if (legacy[0]?.ai_config) {
    const stored = legacy[0].ai_config as Record<string, string>;
    const apiKey = stored.encryptedApiKey
      ? decryptApiKey(stored.encryptedApiKey, stored.iv)
      : '';
    if (stored.provider === 'local_llm') {
      return {
        provider: 'local_llm',
        model: stored.localLlmModelName ?? 'custom',
        apiKey,
        localLlmBaseUrl: stored.localLlmBaseUrl,
        localLlmModelName: stored.localLlmModelName,
        source: 'tenant',
      };
    }
    return {
      provider: stored.provider,
      model: stored.model,
      apiKey,
      azureEndpoint: stored.azureEndpoint,
      azureDeploymentName: stored.azureDeploymentName,
      source: 'tenant',
    };
  }

  // 3. Platform credentials from env (Wings2i defaults or Anthropic key)
  const serverKey =
    process.env.WINGS2I_AI_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? '';
  if (!serverKey) {
    const err = new Error(
      'No AI API key configured — set ANTHROPIC_API_KEY in server .env or configure in Setup → AI Configuration',
    ) as Error & { code: string; status: number };
    err.code = 'AI_NOT_CONFIGURED';
    err.status = 503;
    throw err;
  }

  return {
    provider: process.env.WINGS2I_AI_PROVIDER ?? 'anthropic',
    model: process.env.WINGS2I_AI_MODEL ?? 'claude-opus-4-5',
    apiKey: serverKey,
    source: 'server',
  };
}

export async function getAiConfigStatusForAdmin(tenantId: string): Promise<{
  isConfigured: boolean;
  provider?: string;
  model?: string;
  configuredAt?: string;
}> {
  const row = await prisma.coreAiTenantConfig.findUnique({ where: { tenant_id: tenantId } });
  if (row) {
    return {
      isConfigured: true,
      provider: row.provider as string,
      model: row.provider === CoreAiProvider.local_llm
        ? (row.local_llm_model_name ?? 'custom')
        : row.model,
      configuredAt: row.configured_at.toISOString(),
    };
  }

  // Check legacy
  const legacy = await prisma.$queryRaw<Array<{ ai_config: unknown }>>`
    SELECT ai_config FROM tenant_settings WHERE tenant_id = ${tenantId}::uuid LIMIT 1
  `;
  if (!legacy[0]?.ai_config) return { isConfigured: false };
  const stored = legacy[0].ai_config as Record<string, string>;
  return {
    isConfigured: true,
    provider: stored.provider,
    model: stored.model,
    configuredAt: stored.configuredAt,
  };
}

// ─── Usage logging ────────────────────────────────────────────────────────────

export function logAiUsage(params: LogAiUsageParams): void {
  const totalTokens =
    params.inputTokens != null && params.outputTokens != null
      ? params.inputTokens + params.outputTokens
      : undefined;

  const cost = estimateCost(
    params.model,
    params.inputTokens ?? undefined,
    params.outputTokens ?? undefined,
  );

  const data = {
    tenant_id:          params.tenantId   ?? null,
    user_id:            params.userId     ?? null,
    scope:              params.scope,
    feature:            params.feature,
    provider:           params.provider,
    model:              params.model,
    input_tokens:       params.inputTokens  ?? null,
    output_tokens:      params.outputTokens ?? null,
    total_tokens:       totalTokens ?? null,
    estimated_cost_usd: cost != null ? cost : null,
    latency_ms:         params.latencyMs  ?? null,
    status:             params.status,
    error_code:         params.errorCode  ?? null,
    request_id:         params.requestId  ?? null,
  };

  // Write to Core table
  prisma.coreAiUsageLog
    .create({ data })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[coreAi] Failed to write core_ai_usage_logs:', msg);
    });

  // Strangler bridge: also write to legacy ai_usage_logs
  prisma.$executeRaw`
    INSERT INTO ai_usage_logs (
      tenant_id, user_id, scope, feature, provider, model,
      input_tokens, output_tokens, total_tokens, estimated_cost_usd,
      latency_ms, status, error_code, request_id
    ) VALUES (
      ${data.tenant_id}::uuid,
      ${data.user_id}::uuid,
      ${data.scope},
      ${data.feature},
      ${data.provider},
      ${data.model},
      ${data.input_tokens},
      ${data.output_tokens},
      ${data.total_tokens},
      ${data.estimated_cost_usd},
      ${data.latency_ms},
      ${data.status},
      ${data.error_code},
      ${data.request_id}
    )
  `.catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[coreAi] Failed to mirror to ai_usage_logs:', msg);
  });
}

// ─── Unified AI completion ────────────────────────────────────────────────────

export async function aiComplete(
  params: CoreAiCompleteParams,
): Promise<CoreAiCompleteResult> {
  const creds = await resolveAiCredentials(params.tenantId);
  const start = Date.now();

  let content = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let status: 'success' | 'error' = 'success';
  let errorCode: string | undefined;

  try {
    if (creds.provider === 'anthropic') {
      const body: Record<string, unknown> = {
        model: creds.model,
        max_tokens: params.maxTokens ?? 4096,
        messages: params.messages,
      };
      if (params.systemPrompt) body.system = params.systemPrompt;
      if (params.temperature != null) body.temperature = params.temperature;

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': creds.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`Anthropic API error: ${resp.status}`);
      const json = await resp.json() as {
        content: Array<{ type: string; text?: string }>;
        usage: { input_tokens: number; output_tokens: number };
      };
      content = json.content[0]?.type === 'text' ? (json.content[0].text ?? '') : '';
      inputTokens = json.usage.input_tokens;
      outputTokens = json.usage.output_tokens;

    } else if (creds.provider === 'openai' || creds.provider === 'azure_openai') {
      const url = creds.provider === 'azure_openai'
        ? `${creds.azureEndpoint}/openai/deployments/${creds.azureDeploymentName}/chat/completions?api-version=2024-02-15-preview`
        : 'https://api.openai.com/v1/chat/completions';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      headers[creds.provider === 'azure_openai' ? 'api-key' : 'Authorization'] =
        creds.provider === 'azure_openai' ? creds.apiKey : `Bearer ${creds.apiKey}`;

      const messages = params.systemPrompt
        ? [{ role: 'system', content: params.systemPrompt }, ...params.messages]
        : params.messages;
      const body: Record<string, unknown> = { messages, max_tokens: params.maxTokens ?? 4096 };
      if (creds.provider !== 'azure_openai') body.model = creds.model;
      if (params.temperature != null) body.temperature = params.temperature;

      const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!resp.ok) throw new Error(`AI API error: ${resp.status}`);
      const json = await resp.json() as {
        choices: Array<{ message: { content: string } }>;
        usage: { prompt_tokens: number; completion_tokens: number };
      };
      content = json.choices?.[0]?.message?.content ?? '';
      inputTokens = json.usage?.prompt_tokens ?? 0;
      outputTokens = json.usage?.completion_tokens ?? 0;

    } else {
      throw new Error(`aiComplete: provider '${creds.provider}' not supported in Core`);
    }
  } catch (err: unknown) {
    status = 'error';
    errorCode = err instanceof Error ? err.message.slice(0, 200) : 'UNKNOWN';
    logAiUsage({
      tenantId: params.tenantId,
      userId: params.userId,
      scope: 'tenant',
      feature: params.feature,
      provider: creds.provider,
      model: creds.model,
      latencyMs: Date.now() - start,
      status: 'error',
      errorCode,
    });
    throw err;
  }

  logAiUsage({
    tenantId: params.tenantId,
    userId: params.userId,
    scope: 'tenant',
    feature: params.feature,
    provider: creds.provider,
    model: creds.model,
    inputTokens,
    outputTokens,
    latencyMs: Date.now() - start,
    status,
  });

  return { content, usage: { inputTokens, outputTokens } };
}
