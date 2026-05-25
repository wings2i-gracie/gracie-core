-- E2.14: Reporting engine extraction to gracie-core
-- Creates core_report_templates, core_report_runs, core_scheduled_reports.
-- Copies existing data from Privacy's report_runs and report_schedules tables.
-- Legacy tables are NOT dropped (strangler bridge).

-- ── core_report_templates (global — no tenant_id; Wings2i-managed) ─────────────

CREATE TABLE IF NOT EXISTS core_report_templates (
  id                UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_key       VARCHAR(100) NOT NULL,
  template_key      VARCHAR(100) NOT NULL,
  name              TEXT         NOT NULL,
  description       TEXT,
  report_type_key   VARCHAR(100) NOT NULL,
  supported_formats TEXT[]       NOT NULL DEFAULT ARRAY['pdf','excel','csv','html'],
  default_format    VARCHAR(20)  NOT NULL DEFAULT 'pdf',
  sort_order        INTEGER      NOT NULL DEFAULT 0,
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT core_report_templates_product_template_uq UNIQUE (product_key, template_key)
);

CREATE INDEX IF NOT EXISTS core_report_templates_product_key_idx ON core_report_templates(product_key);

-- ── core_report_runs (per tenant) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core_report_runs (
  id               UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        UUID         NOT NULL REFERENCES core_tenants(id) ON DELETE CASCADE,
  template_key     VARCHAR(100),
  report_type      VARCHAR(100) NOT NULL,
  title            TEXT         NOT NULL,
  scope            JSONB        NOT NULL DEFAULT '{}',
  format           VARCHAR(20)  NOT NULL,
  generated_by     UUID         NOT NULL,
  generated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  file_ref         TEXT,
  file_size_bytes  INTEGER,
  shared_with      JSONB        NOT NULL DEFAULT '[]',
  status           VARCHAR(20)  NOT NULL DEFAULT 'ready',
  deleted_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS core_report_runs_tenant_type_idx     ON core_report_runs(tenant_id, report_type);
CREATE INDEX IF NOT EXISTS core_report_runs_tenant_generated_idx ON core_report_runs(tenant_id, generated_at);

-- Copy existing report runs from Privacy (only rows whose tenant exists in core_tenants)
INSERT INTO core_report_runs (
  id, tenant_id, report_type, title, scope, format,
  generated_by, generated_at, file_ref, file_size_bytes,
  shared_with, status, deleted_at, created_at, updated_at
)
SELECT
  rr.id,
  rr.tenant_id,
  rr.report_type,
  rr.title,
  COALESCE(rr.scope, '{}'::jsonb)          AS scope,
  rr.format::text                          AS format,
  rr.generated_by,
  rr.generated_at,
  rr.file_ref,
  rr.file_size_bytes,
  COALESCE(rr.shared_with, '[]'::jsonb)   AS shared_with,
  COALESCE(rr.status, 'ready')            AS status,
  rr.deleted_at,
  rr.generated_at                          AS created_at,
  rr.generated_at                          AS updated_at
FROM report_runs rr
WHERE EXISTS (SELECT 1 FROM core_tenants ct WHERE ct.id = rr.tenant_id)
ON CONFLICT (id) DO NOTHING;

-- ── core_scheduled_reports (per tenant) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS core_scheduled_reports (
  id           UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    UUID         NOT NULL REFERENCES core_tenants(id) ON DELETE CASCADE,
  template_key VARCHAR(100),
  report_type  VARCHAR(100) NOT NULL,
  title        TEXT         NOT NULL,
  scope        JSONB        NOT NULL DEFAULT '{}',
  format       VARCHAR(20)  NOT NULL,
  frequency    VARCHAR(20)  NOT NULL,
  next_run     DATE         NOT NULL,
  last_run_at  TIMESTAMPTZ,
  recipients   JSONB        NOT NULL DEFAULT '[]',
  is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
  created_by   UUID         NOT NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS core_scheduled_reports_tenant_idx    ON core_scheduled_reports(tenant_id);
CREATE INDEX IF NOT EXISTS core_scheduled_reports_next_run_idx  ON core_scheduled_reports(next_run, is_active);

-- Copy existing schedules from Privacy (only rows whose tenant exists in core_tenants)
INSERT INTO core_scheduled_reports (
  id, tenant_id, report_type, title, scope, format, frequency,
  next_run, last_run_at, recipients, is_active, created_by,
  created_at, updated_at, deleted_at
)
SELECT
  rs.id,
  rs.tenant_id,
  rs.report_type,
  rs.title,
  COALESCE(rs.scope, '{}'::jsonb)       AS scope,
  rs.format::text                       AS format,
  rs.frequency::text                    AS frequency,
  rs.next_run,
  rs.last_run_at,
  COALESCE(rs.recipients, '[]'::jsonb)  AS recipients,
  rs.is_active,
  rs.created_by,
  rs.created_at,
  rs.updated_at,
  rs.deleted_at
FROM report_schedules rs
WHERE EXISTS (SELECT 1 FROM core_tenants ct WHERE ct.id = rs.tenant_id)
ON CONFLICT (id) DO NOTHING;
