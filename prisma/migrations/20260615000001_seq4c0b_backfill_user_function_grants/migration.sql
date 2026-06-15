-- Seq 4c-0b STEP 3: backfill core_user_function_grants from core_users.function_id.
--
-- Inserts ONE grant row for every core_users row that has a non-null function_id.
-- core_users.tenant_id is nullable but the grant table requires tenant_id NOT NULL,
-- so rows with a null tenant_id (if any) are skipped — they cannot form a valid,
-- tenant-scoped grant. System backfill => granted_by = NULL (the column is nullable).
--
-- Idempotent: ON CONFLICT on the (tenant_id, user_id, function_id) unique index does
-- nothing, so re-running creates no duplicates and never errors. This mirrors the
-- revive-or-create idempotency of grantFunctionToUser(), which keys on the same
-- unique constraint.
--
-- Additive / non-destructive: copies FROM core_users.function_id, never modifies
-- core_users or any other table; drops nothing.

INSERT INTO "core_user_function_grants"
    ("tenant_id", "user_id", "function_id", "granted_by", "updated_at")
SELECT
    u."tenant_id",
    u."id",
    u."function_id",
    NULL,
    now()
FROM "core_users" u
WHERE u."function_id" IS NOT NULL
  AND u."tenant_id" IS NOT NULL
ON CONFLICT ("tenant_id", "user_id", "function_id") DO NOTHING;
