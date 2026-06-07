-- Session A: C-DD1 forward-compat columns on core_regulations
-- Adds owner_scope (GLOBAL | TENANT) and nullable tenant_id.
-- All existing rows take owner_scope='GLOBAL', tenant_id=NULL by DEFAULT — no data migration needed.

ALTER TABLE core_regulations
  ADD COLUMN IF NOT EXISTS owner_scope TEXT NOT NULL DEFAULT 'GLOBAL',
  ADD COLUMN IF NOT EXISTS tenant_id   UUID DEFAULT NULL;

ALTER TABLE core_regulations
  ADD CONSTRAINT core_regulations_scope_check
    CHECK (
      (owner_scope = 'GLOBAL' AND tenant_id IS NULL)
      OR
      (owner_scope = 'TENANT' AND tenant_id IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS core_regulations_scope_tenant_idx
  ON core_regulations (owner_scope, tenant_id);
