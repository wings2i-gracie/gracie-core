-- S-SUPERADMIN-PHASE1 (F1 + D-D): snapshot audit actor, lift the Restrict that
-- blocked user hard-delete / tenant purge, and seed the single platform/automation
-- audit actor. All non-destructive — no backfill, existing rows untouched.
--
-- NOTE: hand-authored (not `prisma migrate dev`). Core's shadow-DB diff cannot run
-- because Core migrations @@map onto Privacy-owned objects (e.g. the `task_status`
-- enum) that a fresh shadow DB lacks — the long-standing cross-package limitation.
-- The SQL below mirrors exactly what Prisma would emit for the schema.prisma change
-- (3 nullable columns + user_id DROP NOT NULL + FK changed to ON DELETE SET NULL).
-- IF [NOT] EXISTS guards make a manual re-apply safe; Prisma never re-runs a recorded
-- migration regardless.

-- ── F1.1 — Snapshot actor identity columns (nullable; populated at write time) ──
ALTER TABLE "core_audit_log" ADD COLUMN IF NOT EXISTS "actor_name"  TEXT;
ALTER TABLE "core_audit_log" ADD COLUMN IF NOT EXISTS "actor_email" TEXT;
ALTER TABLE "core_audit_log" ADD COLUMN IF NOT EXISTS "actor_role"  TEXT;

-- ── F1.2 — user_id becomes nullable so the FK can SET NULL on actor deletion ────
ALTER TABLE "core_audit_log" ALTER COLUMN "user_id" DROP NOT NULL;

-- ── F1.3 — Replace the actor FK: ON DELETE RESTRICT → ON DELETE SET NULL ────────
-- Live constraint name is the pre-rename legacy `audit_logs_user_id_fkey`; re-add
-- under the Prisma-convention name `core_audit_log_user_id_fkey`.
ALTER TABLE "core_audit_log" DROP CONSTRAINT IF EXISTS "audit_logs_user_id_fkey";
ALTER TABLE "core_audit_log" DROP CONSTRAINT IF EXISTS "core_audit_log_user_id_fkey";
ALTER TABLE "core_audit_log"
  ADD CONSTRAINT "core_audit_log_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "core_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── D-D — Seed the single platform/automation audit actor (idempotent) ─────────
-- Non-login: is_active = false short-circuits validateCredentials before any password
-- check, and the password_hash sentinel is not a valid bcrypt hash so verifyPassword
-- can never match. No tenant / organisation. role 'system' (known to the registry but
-- excluded from every assignable/selectable role list). id MUST stay distinct from the
-- all-zeros SYSTEM_AUTHOR_ID created_by sentinel.
INSERT INTO "core_users" (
  id, email, password_hash, first_name, last_name, role,
  is_active, must_change_password, tenant_id, organisation_id, created_at, updated_at
) VALUES (
  '99d597d8-fe4f-4e59-8507-e55a2492fb2c',
  'system@automation.gracie.internal',
  'SYSTEM-ACTOR-NO-LOGIN',
  'System',
  'Automated Job',
  'system',
  false,
  false,
  NULL,
  NULL,
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;
