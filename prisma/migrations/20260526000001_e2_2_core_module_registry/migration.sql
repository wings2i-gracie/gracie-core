-- E2.2: core_module_registry table
-- Global registry of module keys per product, used by Core's permissions engine.
-- No tenant_id — this is product-level metadata, not per-tenant data.

CREATE TABLE IF NOT EXISTS core_module_registry (
  id          UUID         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_key VARCHAR(50)  NOT NULL,
  module_key  VARCHAR(100) NOT NULL,
  label       VARCHAR(200),
  sort_order  INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT core_module_registry_product_key_module_key_key UNIQUE (product_key, module_key)
);

CREATE INDEX IF NOT EXISTS core_module_registry_product_key_idx ON core_module_registry (product_key);
