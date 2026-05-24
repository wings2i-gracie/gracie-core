-- E2.7: Create core_notifications table in gracie-core namespace.
-- Old Privacy notifications table is retained (strangler bridge — NOT dropped).
-- Data is copied from notifications via INSERT ... ON CONFLICT DO NOTHING.

CREATE TABLE IF NOT EXISTS core_notifications (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id       UUID        NOT NULL,
  organisation_id UUID        NOT NULL,
  user_id         UUID        NOT NULL,
  event_type      TEXT        NOT NULL,
  title           TEXT        NOT NULL,
  body            TEXT        NOT NULL,
  record_ref      TEXT,
  record_module   TEXT,
  is_read         BOOLEAN     NOT NULL DEFAULT false,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  CONSTRAINT fk_core_notifications_tenant FOREIGN KEY (tenant_id) REFERENCES core_tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_core_notifications_user   FOREIGN KEY (user_id)   REFERENCES core_users(id)
);

CREATE INDEX IF NOT EXISTS core_notifications_tenant_idx      ON core_notifications(tenant_id);
CREATE INDEX IF NOT EXISTS core_notifications_tenant_user_idx ON core_notifications(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS core_notifications_user_idx        ON core_notifications(user_id);

-- Copy existing data (idempotent via ON CONFLICT DO NOTHING)
INSERT INTO core_notifications
  (id, tenant_id, organisation_id, user_id, event_type, title, body,
   record_ref, record_module, is_read, read_at, created_at)
SELECT
  id, tenant_id, organisation_id, user_id, event_type, title, body,
  record_ref, record_module, is_read, read_at, created_at
FROM notifications
ON CONFLICT (id) DO NOTHING;
