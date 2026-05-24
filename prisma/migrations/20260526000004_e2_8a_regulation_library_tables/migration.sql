-- E2.8a: Regulation Library tables
-- Creates core_regulations, core_privacy_principles, core_regulation_documents,
-- and core_tenant_regulation_toggles alongside existing Privacy tables (strangler pattern).

CREATE TABLE IF NOT EXISTS core_regulations (
  id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
  code                VARCHAR     NOT NULL,
  name                VARCHAR     NOT NULL,
  short_name          VARCHAR,
  jurisdiction        VARCHAR     NOT NULL,
  authority           VARCHAR,
  effective_date      DATE,
  description         TEXT,
  status              VARCHAR     NOT NULL DEFAULT 'published',
  terminology         JSONB,
  legal_basis_options JSONB,
  country_codes       JSONB,
  changelog           TEXT,
  is_active           BOOLEAN     NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT core_regulations_pkey PRIMARY KEY (id),
  CONSTRAINT core_regulations_code_key UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS core_regulations_code_idx ON core_regulations(code);

CREATE TABLE IF NOT EXISTS core_privacy_principles (
  id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  code        VARCHAR     NOT NULL,
  name        VARCHAR     NOT NULL,
  description TEXT        NOT NULL,
  sort_order  INT         NOT NULL DEFAULT 0,
  CONSTRAINT core_privacy_principles_pkey PRIMARY KEY (id),
  CONSTRAINT core_privacy_principles_code_key UNIQUE (code)
);

CREATE TABLE IF NOT EXISTS core_regulation_documents (
  id                UUID        NOT NULL DEFAULT gen_random_uuid(),
  regulation_id     UUID        NOT NULL,
  title             VARCHAR     NOT NULL,
  doc_type          VARCHAR     NOT NULL,
  source_type       VARCHAR     NOT NULL,
  file_ref          VARCHAR,
  external_url      VARCHAR,
  issuing_authority VARCHAR,
  version           VARCHAR,
  effective_date    DATE,
  description       TEXT,
  file_size_bytes   INT,
  page_count        INT,
  is_visible        BOOLEAN     NOT NULL DEFAULT true,
  sort_order        INT         NOT NULL DEFAULT 0,
  created_by        UUID        NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ,
  CONSTRAINT core_regulation_documents_pkey PRIMARY KEY (id),
  CONSTRAINT core_regulation_documents_regulation_id_fkey
    FOREIGN KEY (regulation_id) REFERENCES core_regulations(id)
);

CREATE INDEX IF NOT EXISTS core_regulation_documents_regulation_idx
  ON core_regulation_documents(regulation_id);

CREATE TABLE IF NOT EXISTS core_tenant_regulation_toggles (
  id                 UUID        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL,
  regulation_id      UUID        NOT NULL,
  is_enabled         BOOLEAN     NOT NULL DEFAULT false,
  jurisdiction_detail VARCHAR,
  updated_by         UUID        NOT NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT core_tenant_regulation_toggles_pkey PRIMARY KEY (id),
  CONSTRAINT core_tenant_regulation_toggles_tenant_id_regulation_id_key
    UNIQUE (tenant_id, regulation_id),
  CONSTRAINT core_tenant_regulation_toggles_regulation_id_fkey
    FOREIGN KEY (regulation_id) REFERENCES core_regulations(id)
);

CREATE INDEX IF NOT EXISTS core_tenant_regulation_toggles_tenant_idx
  ON core_tenant_regulation_toggles(tenant_id);
