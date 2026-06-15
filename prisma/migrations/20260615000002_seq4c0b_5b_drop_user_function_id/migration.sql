-- Seq 4c-0b 5B: drop the legacy single-function ownership column from core_users.
-- The function axis is now resolved exclusively from core_user_function_grants
-- (existing single-function users were backfilled in 20260615000001). This is the
-- irreversible column drop; 5B-prep (C-DD16) cleared all runtime readers first.

-- AlterTable
ALTER TABLE "core_users" DROP COLUMN "function_id";
