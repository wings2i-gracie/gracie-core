-- E2.17: Regulatory Feed curation extraction
-- Creates core_feed_review_status enum, core_feed_sources, core_feed_items,
-- core_tenant_feed_notifications.
-- Privacy has existing wings2i_feed_sources and wings2i_feed_broadcasts tables —
-- data is copied via INSERT ... SELECT ... ON CONFLICT (id) DO NOTHING.
-- core_tenant_feed_notifications is net-new (no equivalent in Privacy).

-- ── Enum: core_feed_review_status ────────────────────────────────────────────

CREATE TYPE "core_feed_review_status" AS ENUM ('pending', 'approved', 'rejected', 'mapped');

-- ── core_feed_sources ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core_feed_sources (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name            VARCHAR(500) NOT NULL,
  url             TEXT        NOT NULL,
  scrape_schedule VARCHAR(100),
  parse_rules     JSONB,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS core_feed_sources_active_idx
  ON core_feed_sources(is_active) WHERE deleted_at IS NULL;

-- Copy existing SA feed sources from Privacy
INSERT INTO core_feed_sources (id, name, url, is_active, created_at, updated_at, deleted_at)
SELECT id, name, url, is_active, created_at, updated_at, deleted_at
FROM wings2i_feed_sources
ON CONFLICT (id) DO NOTHING;

-- ── core_feed_items ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core_feed_items (
  id              UUID                     NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id       UUID                     REFERENCES core_feed_sources(id),
  external_id     VARCHAR(500),
  title           TEXT                     NOT NULL,
  summary         TEXT,
  url             TEXT,
  published_at    TIMESTAMPTZ,
  raw_payload     JSONB,
  review_status   core_feed_review_status  NOT NULL DEFAULT 'pending',
  regulation_code VARCHAR(100),
  reviewed_by     UUID,
  reviewed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ              NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS core_feed_items_source_external_key
  ON core_feed_items(source_id, external_id)
  WHERE source_id IS NOT NULL AND external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS core_feed_items_review_status_idx
  ON core_feed_items(review_status);

CREATE INDEX IF NOT EXISTS core_feed_items_regulation_code_idx
  ON core_feed_items(regulation_code);

CREATE INDEX IF NOT EXISTS core_feed_items_created_at_idx
  ON core_feed_items(created_at DESC);

-- Copy existing SA feed broadcasts from Privacy.
-- Use broadcast.id as external_id for legacy dedup key.
-- Map review_status: reviewed_by IS NOT NULL and NOT ai_draft → 'approved'; else 'pending'.
INSERT INTO core_feed_items (
  id, source_id, external_id, title, summary, url, published_at,
  review_status, regulation_code, reviewed_by, reviewed_at, created_at, updated_at
)
SELECT
  id,
  source_id,
  id::TEXT,
  title,
  summary,
  source_url,
  created_at,
  CASE
    WHEN reviewed_by IS NOT NULL AND NOT ai_draft THEN 'approved'::core_feed_review_status
    ELSE 'pending'::core_feed_review_status
  END,
  regulation_code,
  reviewed_by,
  reviewed_at,
  created_at,
  updated_at
FROM wings2i_feed_broadcasts
WHERE deleted_at IS NULL
ON CONFLICT (id) DO NOTHING;

-- ── core_tenant_feed_notifications ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core_tenant_feed_notifications (
  id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         UUID        NOT NULL REFERENCES core_tenants(id) ON DELETE CASCADE,
  feed_item_id      UUID        NOT NULL REFERENCES core_feed_items(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL,
  notified_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS core_tenant_feed_notifications_tenant_idx
  ON core_tenant_feed_notifications(tenant_id);

CREATE INDEX IF NOT EXISTS core_tenant_feed_notifications_tenant_read_idx
  ON core_tenant_feed_notifications(tenant_id, read_at);

CREATE INDEX IF NOT EXISTS core_tenant_feed_notifications_feed_item_idx
  ON core_tenant_feed_notifications(feed_item_id);

-- No data copy for notifications — net-new table.
