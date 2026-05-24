-- E2.9: AI Configuration + Usage Logging
-- Creates core_ai_tenant_config (tenant AI provider config with encrypted key)
-- and core_ai_usage_logs (mirrors ai_usage_logs structure for strangler bridge).

-- ── AI Provider enum ─────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE core_ai_provider AS ENUM ('openai', 'anthropic', 'azure_openai', 'gemini', 'local_llm');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── core_ai_tenant_config ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core_ai_tenant_config (
  id                    UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id             UUID          NOT NULL UNIQUE,
  provider              core_ai_provider NOT NULL,
  api_key               VARCHAR(2000) NOT NULL DEFAULT '',
  iv                    VARCHAR(100)  NOT NULL DEFAULT '',
  model                 VARCHAR(200)  NOT NULL,
  azure_endpoint        VARCHAR(500),
  azure_deployment_name VARCHAR(200),
  local_llm_base_url    VARCHAR(500),
  local_llm_model_name  VARCHAR(200),
  local_llm_api_key_req BOOLEAN       NOT NULL DEFAULT false,
  spend_cap_usd         DECIMAL(10,2),
  is_active             BOOLEAN       NOT NULL DEFAULT true,
  configured_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  configured_by         UUID,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── core_ai_usage_logs ───────────────────────────────────────────────────────
-- Mirrors Privacy's ai_usage_logs. Both tables coexist (strangler bridge).
-- logAiUsage() in Core writes to BOTH tables.

CREATE TABLE IF NOT EXISTS core_ai_usage_logs (
  id                 UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id          UUID          REFERENCES core_tenants(id) ON DELETE CASCADE,
  user_id            UUID          REFERENCES core_users(id),
  scope              VARCHAR(50)   NOT NULL DEFAULT 'tenant',
  feature            VARCHAR(200)  NOT NULL,
  provider           VARCHAR(100)  NOT NULL,
  model              VARCHAR(200)  NOT NULL,
  input_tokens       INTEGER,
  output_tokens      INTEGER,
  total_tokens       INTEGER,
  estimated_cost_usd DECIMAL(10,6),
  latency_ms         INTEGER,
  status             VARCHAR(50)   NOT NULL DEFAULT 'success',
  error_code         VARCHAR(200),
  request_id         VARCHAR(200),
  created_at         TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS core_ai_usage_logs_tenant_created_idx  ON core_ai_usage_logs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS core_ai_usage_logs_scope_created_idx   ON core_ai_usage_logs(scope, created_at);
CREATE INDEX IF NOT EXISTS core_ai_usage_logs_feature_created_idx ON core_ai_usage_logs(feature, created_at);
