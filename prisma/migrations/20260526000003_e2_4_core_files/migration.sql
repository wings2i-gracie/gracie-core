-- E2.4: core_files — managed file metadata table
-- Applied manually; marked via prisma migrate resolve --applied

CREATE TABLE core_files (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL,
  module_key    VARCHAR(100) NOT NULL,
  original_name VARCHAR(500) NOT NULL,
  file_path     VARCHAR(1000) NOT NULL,
  mime_type     VARCHAR(200) NOT NULL,
  size_bytes    INT         NOT NULL,
  uploaded_by   UUID        NOT NULL REFERENCES core_users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX core_files_tenant_id_idx    ON core_files(tenant_id);
CREATE INDEX core_files_module_key_idx   ON core_files(module_key);
CREATE INDEX core_files_uploaded_by_idx  ON core_files(uploaded_by);
