-- add_jurisdiction_authority_contacts: five optional per-region authority-contact
-- fields on core_jurisdiction_act_region. All nullable; GLOBAL reference data (no
-- tenant scoping). No constraint/index changes — these fields are not part of any key.

ALTER TABLE "core_jurisdiction_act_region"
    ADD COLUMN "authority_name"           TEXT,
    ADD COLUMN "authority_website"        TEXT,
    ADD COLUMN "authority_email"          TEXT,
    ADD COLUMN "authority_phone"          TEXT,
    ADD COLUMN "authority_postal_address" TEXT;
