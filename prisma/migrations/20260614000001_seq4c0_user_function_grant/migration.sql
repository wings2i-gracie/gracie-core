-- Seq 4c-0: user×function ownership grant (additive only).
-- New table only. ZERO changes to core_users, functions, function_id, head_user_id.
-- One user may own MANY functions; ownership supplements (does NOT replace)
-- CoreUser.function_id. Empty table => behaviour identical to before this migration.

CREATE TABLE "core_user_function_grants" (
    "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"   UUID         NOT NULL,
    "user_id"     UUID         NOT NULL,
    "function_id" UUID         NOT NULL,
    "granted_by"  UUID,
    "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "updated_at"  TIMESTAMPTZ  NOT NULL,
    "deleted_at"  TIMESTAMPTZ,

    CONSTRAINT "core_user_function_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "core_user_function_grants_tenant_id_user_id_function_id_key"
    ON "core_user_function_grants" ("tenant_id", "user_id", "function_id");

CREATE INDEX "core_user_function_grants_tenant_id_user_id_idx"
    ON "core_user_function_grants" ("tenant_id", "user_id");
