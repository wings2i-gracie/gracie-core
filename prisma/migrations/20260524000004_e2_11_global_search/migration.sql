-- E2.11: Global Search engine extraction to gracie-core
-- Creates core_search_index table and copies data from Privacy's search_index.
-- Old search_index table is NOT dropped (strangler bridge).

-- ── core_search_index ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core_search_index (
  id         UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id  UUID          NOT NULL REFERENCES core_tenants(id) ON DELETE CASCADE,
  module_key VARCHAR(100)  NOT NULL,
  record_id  UUID          NOT NULL,
  title      VARCHAR(500)  NOT NULL,
  body       TEXT,
  url        VARCHAR(500),
  tags       TEXT[]        NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT core_search_index_tenant_module_record_uq UNIQUE (tenant_id, module_key, record_id)
);

CREATE INDEX IF NOT EXISTS core_search_index_tenant_idx ON core_search_index(tenant_id);
CREATE INDEX IF NOT EXISTS core_search_index_module_idx ON core_search_index(module_key);

-- ── Copy existing data from search_index ─────────────────────────────────────
-- Maps: module → module_key, record_id::UUID cast, is_active=false → deleted_at.
-- Only copies rows whose tenant_id exists in core_tenants (FK safety).

INSERT INTO core_search_index (id, tenant_id, module_key, record_id, title, body, created_at, updated_at, deleted_at)
SELECT
  si.id,
  si.tenant_id,
  si.module                                                    AS module_key,
  si.record_id::UUID                                           AS record_id,
  si.title,
  si.body,
  si.created_at,
  si.updated_at,
  CASE WHEN si.is_active = false THEN si.updated_at ELSE NULL END AS deleted_at
FROM search_index si
WHERE EXISTS (SELECT 1 FROM core_tenants ct WHERE ct.id = si.tenant_id)
ON CONFLICT (tenant_id, module_key, record_id) DO NOTHING;
