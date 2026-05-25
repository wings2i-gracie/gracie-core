-- E2.16: Tenant management + license management extraction
-- Creates core_tenant_licenses, core_support_mode_sessions.
-- No legacy tables exist in Privacy for these:
--   Licenses are stored as a single field (tenant_settings.package_tier).
--   Support mode is stateless JWT (no session table in Privacy).
-- Both tables are net-new in gracie-core.

-- ── Enum: core_license_tier ───────────────────────────────────────────────────

CREATE TYPE "core_license_tier" AS ENUM ('core', 'professional', 'enterprise');

-- ── core_tenant_licenses ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core_tenant_licenses (
  id          UUID                NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID                NOT NULL REFERENCES core_tenants(id) ON DELETE CASCADE,
  product_key VARCHAR(100)        NOT NULL,
  tier        core_license_tier   NOT NULL DEFAULT 'core',
  valid_from  TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  assigned_by UUID                NOT NULL,
  created_at  TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS core_tenant_licenses_tenant_idx
  ON core_tenant_licenses(tenant_id);

-- Partial unique: only one active license per tenant+product
CREATE UNIQUE INDEX IF NOT EXISTS core_tenant_licenses_tenant_product_active_idx
  ON core_tenant_licenses(tenant_id, product_key)
  WHERE deleted_at IS NULL;

-- ── core_support_mode_sessions ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core_support_mode_sessions (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id           UUID        NOT NULL REFERENCES core_tenants(id) ON DELETE CASCADE,
  super_admin_user_id UUID        NOT NULL,
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL,
  exited_at           TIMESTAMPTZ,
  audit_note          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS core_support_mode_sessions_tenant_idx
  ON core_support_mode_sessions(tenant_id);

CREATE INDEX IF NOT EXISTS core_support_mode_sessions_super_admin_idx
  ON core_support_mode_sessions(super_admin_user_id);

-- No data copy — Privacy has no equivalent tables to migrate.
