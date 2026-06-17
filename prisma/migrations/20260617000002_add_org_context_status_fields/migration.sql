-- S-STATUS-MODEL: authoritative lifecycle status on functions + locations.
-- status VARCHAR NOT NULL DEFAULT 'active' — valid values 'active' | 'deactivated'
-- | 'removed' (app-level validation only, no DB enum — lesson 17 varchar pattern).
-- Locations additionally gain deleted_at (purge clock) which functions already had.
--
-- Core's CoreFunction / CoreLocation models @@map to the E4.2 compat views
-- (functions / locations), which are `SELECT * FROM privacy_*`. A `SELECT *` view
-- snapshots its column list at creation, so newly-added base-table columns are NOT
-- visible through it until the view is re-expanded. CREATE OR REPLACE VIEW re-parses
-- the `*` (new columns append to the end → replace is allowed) and preserves grants.

-- Functions: status only (deleted_at already exists).
ALTER TABLE privacy_functions ADD COLUMN status VARCHAR NOT NULL DEFAULT 'active';

-- Locations: status + deleted_at (locations previously had neither).
ALTER TABLE privacy_locations ADD COLUMN status VARCHAR NOT NULL DEFAULT 'active';
ALTER TABLE privacy_locations ADD COLUMN deleted_at TIMESTAMPTZ NULL;

-- Re-expand the compat views so Core's Prisma client (which queries the views) sees
-- the new columns.
CREATE OR REPLACE VIEW functions AS SELECT * FROM privacy_functions;
CREATE OR REPLACE VIEW locations AS SELECT * FROM privacy_locations;
