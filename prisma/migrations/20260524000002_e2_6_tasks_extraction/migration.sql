-- E2.6: Create core_tasks* tables in gracie-core namespace.
-- Enum types (task_status, task_priority, task_source, task_recurrence_frequency)
-- already exist from Privacy migrations — no CREATE TYPE needed.
-- Data is copied from old Privacy tables (strangler bridge — old tables NOT dropped).

-- ── core_tasks ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core_tasks (
  id            UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID          NOT NULL,
  title         TEXT          NOT NULL,
  description   TEXT,
  status        task_status   NOT NULL DEFAULT 'todo',
  priority      task_priority NOT NULL DEFAULT 'medium',
  source        task_source   NOT NULL DEFAULT 'manual',
  source_id     UUID,
  source_module TEXT,
  owner_id      UUID          NOT NULL,
  function_id   UUID,
  due_date      TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_by    UUID,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,
  CONSTRAINT fk_core_tasks_tenant   FOREIGN KEY (tenant_id)   REFERENCES core_tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_core_tasks_owner    FOREIGN KEY (owner_id)    REFERENCES core_users(id),
  CONSTRAINT fk_core_tasks_creator  FOREIGN KEY (created_by)  REFERENCES core_users(id),
  CONSTRAINT fk_core_tasks_function FOREIGN KEY (function_id) REFERENCES functions(id)
);

CREATE INDEX IF NOT EXISTS core_tasks_tenant_idx        ON core_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS core_tasks_tenant_owner_idx  ON core_tasks(tenant_id, owner_id);
CREATE INDEX IF NOT EXISTS core_tasks_tenant_status_idx ON core_tasks(tenant_id, status);

-- ── core_task_sub_tasks ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core_task_sub_tasks (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id    UUID        NOT NULL,
  title      TEXT        NOT NULL,
  completed  BOOLEAN     NOT NULL DEFAULT false,
  sort_order INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_core_task_sub_tasks_task FOREIGN KEY (task_id) REFERENCES core_tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS core_task_sub_tasks_task_idx ON core_task_sub_tasks(task_id);

-- ── core_task_watchers ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core_task_watchers (
  task_id UUID NOT NULL,
  user_id UUID NOT NULL,
  PRIMARY KEY (task_id, user_id),
  CONSTRAINT fk_core_task_watchers_task FOREIGN KEY (task_id) REFERENCES core_tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_core_task_watchers_user FOREIGN KEY (user_id) REFERENCES core_users(id)
);

-- ── core_task_recurrence_configs ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core_task_recurrence_configs (
  id              UUID                      NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id         UUID                      NOT NULL UNIQUE,
  frequency       task_recurrence_frequency NOT NULL,
  next_due        DATE                      NOT NULL,
  last_created_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_core_task_recurrence_configs_task FOREIGN KEY (task_id) REFERENCES core_tasks(id) ON DELETE CASCADE
);

-- ── core_task_templates ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS core_task_templates (
  id                    UUID          NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id             UUID          NOT NULL,
  title                 TEXT          NOT NULL,
  description           TEXT,
  source_tag            task_source   NOT NULL DEFAULT 'manual',
  default_priority      task_priority NOT NULL DEFAULT 'medium',
  default_assignee_role TEXT,
  is_system             BOOLEAN       NOT NULL DEFAULT false,
  created_by            UUID,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS core_task_templates_tenant_idx ON core_task_templates(tenant_id);

-- ── Copy data from old Privacy tables (idempotent via ON CONFLICT DO NOTHING) ─

INSERT INTO core_tasks
  (id, tenant_id, title, description, status, priority, source, source_id, source_module,
   owner_id, function_id, due_date, completed_at, created_by, created_at, updated_at, deleted_at)
SELECT
  id, tenant_id, title, description, status, priority, source, source_id, source_module,
  owner_id, function_id, due_date, completed_at, created_by, created_at, updated_at, deleted_at
FROM tasks
ON CONFLICT (id) DO NOTHING;

INSERT INTO core_task_sub_tasks (id, task_id, title, completed, sort_order, created_at)
SELECT id, task_id, title, completed, sort_order, created_at
FROM task_sub_tasks
ON CONFLICT (id) DO NOTHING;

INSERT INTO core_task_watchers (task_id, user_id)
SELECT task_id, user_id
FROM task_watchers
ON CONFLICT (task_id, user_id) DO NOTHING;

INSERT INTO core_task_recurrence_configs
  (id, task_id, frequency, next_due, last_created_at, created_at, updated_at)
SELECT id, task_id, frequency, next_due, last_created_at, created_at, updated_at
FROM task_recurrence_config
ON CONFLICT (id) DO NOTHING;

INSERT INTO core_task_templates
  (id, tenant_id, title, description, source_tag, default_priority, default_assignee_role,
   is_system, created_by, created_at, updated_at, deleted_at)
SELECT
  id, tenant_id, title, description, source_tag, default_priority, default_assignee_role,
  is_system, created_by, created_at, updated_at, deleted_at
FROM task_template_library
ON CONFLICT (id) DO NOTHING;
