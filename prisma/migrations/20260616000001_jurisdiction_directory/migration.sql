-- jurisdiction_directory: core_jurisdiction_act + core_jurisdiction_act_region (1a, GLOBAL reference)
-- Net-new tables only. Directory is purely GLOBAL (Wings2i-maintained): NO owner_scope/tenant_id.
-- act -> core_regulations is a nullable FK (no cascade). region -> act cascades on delete.

CREATE TABLE "core_jurisdiction_act" (
    "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
    "act_name"      TEXT         NOT NULL,
    "authority"     TEXT,
    "official_url"  TEXT,
    "regulation_id" UUID,
    "is_active"     BOOLEAN      NOT NULL DEFAULT true,
    "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "updated_at"    TIMESTAMPTZ  NOT NULL,

    CONSTRAINT "core_jurisdiction_act_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_core_jurisdiction_act_regulation"
        FOREIGN KEY ("regulation_id") REFERENCES "core_regulations" ("id")
);

CREATE TABLE "core_jurisdiction_act_region" (
    "id"           UUID    NOT NULL DEFAULT gen_random_uuid(),
    "act_id"       UUID    NOT NULL,
    "country_code" TEXT    NOT NULL,
    "region"       TEXT,

    CONSTRAINT "core_jurisdiction_act_region_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_core_jurisdiction_act_region_act"
        FOREIGN KEY ("act_id") REFERENCES "core_jurisdiction_act" ("id") ON DELETE CASCADE
);

-- Block exact duplicate jurisdiction per act. NB: NULL region rows are distinct
-- under a plain UNIQUE, so the partial index below covers the no-region case.
CREATE UNIQUE INDEX "core_jurisdiction_act_region_act_id_country_code_region_key"
    ON "core_jurisdiction_act_region" ("act_id", "country_code", "region");

-- Enforce one no-region row per (act_id, country_code) (NULLs distinct otherwise).
CREATE UNIQUE INDEX "core_jurisdiction_act_region_act_id_country_code_null_region_key"
    ON "core_jurisdiction_act_region" ("act_id", "country_code")
    WHERE "region" IS NULL;

-- Advisory lookup: given a location, find acts.
CREATE INDEX "core_jurisdiction_act_region_country_code_region_idx"
    ON "core_jurisdiction_act_region" ("country_code", "region");
