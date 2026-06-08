-- C-DD1: Add owner_scope + tenant_id to core_regulation_documents.
-- Mirrors the same columns + CHECK + index already on core_regulations (Session A).
-- Existing rows default to GLOBAL / tenant_id NULL — no data migration needed.

ALTER TABLE core_regulation_documents
  ADD COLUMN IF NOT EXISTS owner_scope TEXT NOT NULL DEFAULT 'GLOBAL',
  ADD COLUMN IF NOT EXISTS tenant_id   UUID DEFAULT NULL;

ALTER TABLE core_regulation_documents
  ADD CONSTRAINT core_regulation_documents_scope_check
    CHECK (
      (owner_scope = 'GLOBAL' AND tenant_id IS NULL)
      OR
      (owner_scope = 'TENANT' AND tenant_id IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS core_regulation_documents_scope_tenant_idx
  ON core_regulation_documents (owner_scope, tenant_id);
