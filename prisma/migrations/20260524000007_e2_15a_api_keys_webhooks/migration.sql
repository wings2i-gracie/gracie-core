-- E2.15a: API key management + webhook engine extraction to gracie-core
-- Creates core_api_keys, core_webhook_subscriptions, core_webhook_deliveries.
-- No legacy tables exist in Privacy for these (net-new functionality).

-- ── core_api_keys ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core_api_keys (
  id           UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    UUID          NOT NULL REFERENCES core_tenants(id) ON DELETE CASCADE,
  name         VARCHAR(200)  NOT NULL,
  key_prefix   VARCHAR(10)   NOT NULL,
  key_hash     VARCHAR(100)  NOT NULL,
  scopes       TEXT[]        NOT NULL DEFAULT '{}',
  last_used_at TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS core_api_keys_tenant_idx      ON core_api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS core_api_keys_key_prefix_idx  ON core_api_keys(key_prefix);

-- ── core_webhook_subscriptions ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core_webhook_subscriptions (
  id          UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID          NOT NULL REFERENCES core_tenants(id) ON DELETE CASCADE,
  product_key VARCHAR(100)  NOT NULL,
  event_key   VARCHAR(200)  NOT NULL,
  target_url  TEXT          NOT NULL,
  secret      VARCHAR(500),
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS core_webhook_subscriptions_tenant_idx     ON core_webhook_subscriptions(tenant_id);
CREATE INDEX IF NOT EXISTS core_webhook_subscriptions_event_key_idx  ON core_webhook_subscriptions(event_key);

-- ── core_webhook_deliveries ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core_webhook_deliveries (
  id              UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID          NOT NULL REFERENCES core_webhook_subscriptions(id) ON DELETE CASCADE,
  tenant_id       UUID          NOT NULL REFERENCES core_tenants(id) ON DELETE CASCADE,
  event_key       VARCHAR(200)  NOT NULL,
  payload         JSONB         NOT NULL DEFAULT '{}',
  status          VARCHAR(20)   NOT NULL DEFAULT 'pending',
  attempt_count   INTEGER       NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  next_retry_at   TIMESTAMPTZ,
  response_status INTEGER,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS core_webhook_deliveries_tenant_idx        ON core_webhook_deliveries(tenant_id);
CREATE INDEX IF NOT EXISTS core_webhook_deliveries_subscription_idx  ON core_webhook_deliveries(subscription_id);
CREATE INDEX IF NOT EXISTS core_webhook_deliveries_status_retry_idx  ON core_webhook_deliveries(status, next_retry_at);
