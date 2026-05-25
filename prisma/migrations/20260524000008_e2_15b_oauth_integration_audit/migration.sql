-- E2.15b: OAuth client credentials issuer + Integration audit log
-- Creates core_oauth_clients, core_oauth_tokens, core_integration_audit.
-- No legacy tables exist in Privacy — all net-new functionality.

-- ── core_oauth_clients ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core_oauth_clients (
  id                  UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           UUID          NOT NULL REFERENCES core_tenants(id) ON DELETE CASCADE,
  client_id           VARCHAR(80)   NOT NULL UNIQUE,
  client_secret_hash  VARCHAR(100)  NOT NULL,
  name                VARCHAR(200)  NOT NULL,
  scopes              TEXT[]        NOT NULL DEFAULT '{}',
  grant_types         TEXT[]        NOT NULL DEFAULT '{"client_credentials"}',
  revoked_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS core_oauth_clients_tenant_idx    ON core_oauth_clients(tenant_id);
CREATE INDEX IF NOT EXISTS core_oauth_clients_client_id_idx ON core_oauth_clients(client_id);

-- ── core_oauth_tokens ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core_oauth_tokens (
  id                  UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id           UUID          NOT NULL REFERENCES core_oauth_clients(id) ON DELETE CASCADE,
  tenant_id           UUID          NOT NULL,
  access_token_hash   VARCHAR(200)  NOT NULL,
  scopes              TEXT[]        NOT NULL DEFAULT '{}',
  expires_at          TIMESTAMPTZ   NOT NULL,
  revoked_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS core_oauth_tokens_tenant_idx           ON core_oauth_tokens(tenant_id);
CREATE INDEX IF NOT EXISTS core_oauth_tokens_client_id_idx        ON core_oauth_tokens(client_id);
CREATE INDEX IF NOT EXISTS core_oauth_tokens_access_token_hash_idx ON core_oauth_tokens(access_token_hash);

-- ── core_integration_audit ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core_integration_audit (
  id            UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID          NOT NULL,
  actor_type    VARCHAR(20)   NOT NULL,
  actor_id      VARCHAR(200)  NOT NULL,
  action        VARCHAR(200)  NOT NULL,
  resource_type VARCHAR(100),
  resource_id   VARCHAR(200),
  status_code   INTEGER,
  ip_address    VARCHAR(100),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS core_integration_audit_tenant_idx          ON core_integration_audit(tenant_id);
CREATE INDEX IF NOT EXISTS core_integration_audit_tenant_created_idx  ON core_integration_audit(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS core_integration_audit_actor_type_idx      ON core_integration_audit(actor_type);
