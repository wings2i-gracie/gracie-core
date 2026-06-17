# gracie-core — CLAUDE.md

## Identity
Package: @wings2i-gracie/core
Version: 0.2.0-alpha.1
Purpose: Tier 1 platform package for the GRACie suite.
         Shared server logic, client entry point, Prisma schema.
Registry: GitHub Packages (https://npm.pkg.github.com)
Repo: github.com/wings2i-gracie/gracie-core

## Rules
- May only depend on @wings2i-gracie/contracts plus pg/adapter-pg (no other GRACie packages).
- TypeScript: module Node16 / moduleResolution node16, strict: true.
- Pre-1.0: contracts may evolve freely.
- Post-1.0: strict semver. Breaking changes → v2.

## Structure
/server/src   → Node.js / Express platform server
/client/src   → React client entry point
/prisma       → schema.prisma + migrations (postgresql)

## Prisma Pattern
Custom output: `output = "../server/src/generated/prisma-client"`.
Build script copies generated client to dist/ for packaging.
PrismaClient MUST be constructed with PrismaPg adapter (Prisma 7 client engine
requires driver adapter for custom output paths):
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
Models: CoreTenant (@@map "core_tenants"), CoreUser (@@map "core_users"), CoreFile (@@map "core_files").

## Build
npm run build     → tsc compiles to dist/
npm run typecheck → zero errors expected

## Publish
Push a v* tag → GitHub Actions publishes to GitHub Packages.

## Sessions
E1.2 (2026-05-19) — Initial skeleton. server/src/index.ts + client/src/index.ts
  stubs, prisma/schema.prisma (datasource + generator, no models), package.json,
  tsconfig.json (Node16/node16), .npmrc, .gitignore, publish workflow.
  Depends on @wings2i-gracie/contracts@^0.1.0. v0.1.0 published.
E1.3 (2026-05-19) — CI/CD scaffolding. Added .github/workflows/ci.yml
  (typecheck, lint, dep-direction, prisma-check jobs). Added
  .github/workflows/publish.yml with NODE_AUTH_TOKEN on both npm ci and
  npm publish steps using PACKAGES_TOKEN. Added ESLint devDependencies
  (eslint@^8, @typescript-eslint/parser+plugin@^8) and .eslintrc.json.
E2.1 (2026-05-25) — CoreTenant/CoreUser models + auth/users extraction.
  prisma/schema.prisma: CoreTenant (@@map core_tenants), CoreUser (@@map core_users),
  TenantStatus/UserRole enums; prisma.config.ts with defineConfig.
  server/src/modules/auth/auth.service.ts: generateAccessToken, buildTokenPayload,
  validateCredentials, hashPassword, verifyPassword, validatePasswordPolicy,
  generateTempPassword. Uses CORE_JWT_SECRET env var (fallback JWT_ACCESS_SECRET).
  server/src/middleware/auth.middleware.ts: requireAuth (CORE_JWT_SECRET fallback),
  requireTenant.
  server/src/modules/users/users.service.ts: getUsers, getUserById, updateUser,
  deactivateUser, resetPassword — all use prisma.coreUser.
  server/src/index.ts: exports all above.
  Added @prisma/adapter-pg + pg deps (Prisma 7 driver adapter requirement).
  v0.2.0-alpha.1 tagged + published. Commits: f1e6a8b, 8fc6e57.
E2.4 (2026-05-26) — File Storage abstraction.
  prisma/schema.prisma: CoreFile (@@map core_files) — tenant_id, module_key, original_name,
  file_path, mime_type, size_bytes, uploaded_by (plain UUID, no FK), soft delete.
  Migration: 20260526000003_e2_4_core_files.
  server/src/modules/storage/LocalStorageProvider.ts: implements StorageProvider interface
  from contracts. Base: process.cwd()/uploads. Path: /uploads/{tenantId}/{moduleKey}/{uuid}-{name}.
  server/src/modules/storage/storage.service.ts: uploadFile, getFile, deleteFile,
  getFilesByModule — all tenant-scoped. uploadFile uses same fileId for DB PK and filename prefix.
  index.ts: exports all four service functions + LocalStorageProvider.
E2.5 (2026-05-26) — Org Context extraction (completed in E2.6 session — gap discovered).
  prisma/schema.prisma: CoreOrgProfile/CoreFunction/CoreLocation/CoreEntity/CoreOrgStakeholder
  (@@map to existing Privacy tables); CoreOrgRoleType/CoreOrgRoleAssignment (new tables).
  server/src/modules/orgContext/orgContext.service.ts: Full CRUD for org profile, functions,
  locations, entities, stakeholders; registerOrgRoleType(key, label); getRoleAssignment/
  upsertRoleAssignment; getDpoDetails/upsertDpoDetails wrappers over role assignment API.
  server/src/modules/orgContext/orgContext.router.ts: Routes at /api/v1/core/org with
  requireAuth + requireTenant. Profile, DPO, functions, locations (with type filter), entities,
  stakeholders, role-types.
  index.ts: exports coreOrgRouter + all 22 org context service functions.
  v0.2.0-alpha.2 skipped (CLAUDE.md-recorded publish that never happened).
E2.6 (2026-05-26) — Tasks engine extraction.
  prisma/schema.prisma: CoreTaskStatus/CoreTaskPriority/CoreTaskSource/CoreTaskRecurrenceFrequency
  enums (@@map to existing PostgreSQL enum types); CoreTask/CoreTaskSubTask/CoreTaskWatcher/
  CoreTaskRecurrenceConfig/CoreTaskTemplate models with FK relations.
  Migration: 20260524000002_e2_6_tasks_extraction — creates 5 core_task* tables, copies data
  from old Privacy tasks tables via INSERT ... SELECT ... ON CONFLICT DO NOTHING.
  server/src/modules/tasks/tasks.service.ts: Full tasks engine — createTask, listTasks,
  getTaskById, updateTask (with sub-tasks/watchers/recurrence in transaction + auto-recurrence
  on completion), softDeleteTask, getTaskStats, listTemplates, createTemplate,
  createTaskFromTemplate, seedSystemTemplates, advanceDueDate helper.
  server/src/modules/tasks/tasks.router.ts: Routes at /api/v1/core/tasks with requireAuth +
  requireTenant. Full CRUD + stats + templates.
  index.ts: exports coreTasksRouter + all task service functions + enum types.
  v0.2.0-alpha.3 tagged.
S-CDD1-CHECKPOINT (2026-06-07) — read-only investigation of Library ownership-scope; findings in docs/investigations/CDD1-library-ownership-scope-findings.md; no code changed.
S-REGTABLE-DUP-CHECKPOINT (2026-06-07) — read-only investigation of privacy_regulations + toggle-table duplication; findings in docs/investigations/regulation-table-duplication-findings.md; no code changed.
C-DD1-OWNERSHIP-SCOPE (2026-06-08) — migration 20260608000001 adds owner_scope/tenant_id/CHECK/index to core_regulation_documents; listRegulations() GLOBAL-only filter; listRegulationsWithToggles() scope predicate; createTenantFramework() (org_admin|compliance_manager); ownerScope+tenantId surfaced in both mapped types; 0 tsc errors; migration applied cleanly; no-leakage proof confirmed (a/b/c).
SEQ-4C-0-USER-FUNCTION-GRANT (2026-06-14) — additive core_user_function_grants table (migration 20260614000001) + CoreUserFunctionGrant model (plain-UUID refs, core_users/functions models untouched); shared resolver resolveOwnedFunctionIds + union helper resolveFunctionScope (+ grant/revoke/list helpers) exported from index; Privacy buildRoleScope rewired to the union helper (now async, takes tenantId) — SUPPLEMENT not replace, empty table = bit-for-bit prior single-function behaviour; 0 tsc errors (core + Privacy); migration applied cleanly to gracie_uat_mirror; verified empty-table regression gate + multi-function union on it@test.com; branch feature/seq4c0-user-function-grant held (no version bump, no merge, no UAT). DECISION: user×function ownership grant is Core-owned, SUPPLEMENT (not replace), consumers Privacy + Compliance(C-DD8) — supersedes the open "4a sub-question / arguably Core" status. Old single function_id retirement = separate future sequence (Seq 4c-0b), on evidence once both products consume the grant. Backfill deferred. NOTE: Privacy server/src/utils/scopeFilter.ts getAllowedPiContextIds is dead code (imported nowhere) — left untouched, deferred.
SEQ-4C-0B-BATCH2 (2026-06-15) — grant write-path: tenant-scoped admin router + service-level cross-tenant guard via grantFunctionToUser; backfill migration 20260615000001 (7 owners copied into core_user_function_grants, idempotent ON CONFLICT DO NOTHING); task-list filter now accepts a set of functionIds. Deployed UAT batch 2.
SEQ-4C-0B-5B (2026-06-15) — Phase 5B (Seq 4c-0b): legacy single-function ownership path retired. Commit 54f01da carries migration 20260615000002_seq4c0b_5b_drop_user_function_id = ALTER TABLE core_users DROP COLUMN function_id (irreversible). JWT functionId claim removed. A 6th reader the pre-flight missed — orgContext.service.ts deactivateFunction() — re-expressed onto core_user_function_grants using Approach B (active-user-faithful, two-query). Deployed by manual SCP of dist + prisma/migrations; migration applied with an explicit DATABASE_URL (Core .env injects 0 vars, so prisma sees no URL otherwise). Vestigial params left accepted-but-ignored, flagged for later cleanup: resolveFunctionScope(user.functionId) and updateUser(functionId?). See C-DD17, Consolidated Design Decisions v1.2.

JURISDICTION-DIR-1A (2026-06-16) — net-new GLOBAL jurisdiction directory: core_jurisdiction_act + core_jurisdiction_act_region (migration 20260616000001), nullable FK act→core_regulations, unique(act,country,region) + partial-unique(act,country WHERE region NULL) + index(country,region); jurisdiction.service.ts (list/get/create/update + add/remove region, no tenant — GLOBAL), exported from index.ts. Service-only, no router/UI (deferred to 1b). 0 tsc errors core+Privacy; migration applied to gracie_uat_mirror; service smoke verified + cleaned. Branch feature/jurisdiction-directory-1a, no version bump, no merge, no UAT deploy.

S-COVERAGE-ADVISORY-1A (2026-06-17, build-only) — region pass-through: getLocationsByFunction widened from `Promise<string[]>` to `Promise<Array<{ countryCode; region: string|null }>>` (selects country_code + region from core_locations; the only in-package caller, orgContext.router, passes data through to JSON unchanged). No schema/migration change; index.ts re-export by name (signature picked up automatically). tsc -b 0 errors; consumed by Privacy coverage advisory. Branch feature/coverage-advisory, no version bump, no merge, no UAT deploy.

S-JURISDICTION-AUTHORITY-CONTACTS (2026-06-17, build-only) — five optional authority-contact columns on core_jurisdiction_act_region (authority_name/website/email/phone/postal_address, nullable String?, GLOBAL) via migration 20260617000001_add_jurisdiction_authority_contacts (ADD COLUMN only — no constraint/index change). jurisdiction.service.ts: widened JurisdictionActRegion interface + mapRegion + CreateJurisdictionActInput.regions[] + addJurisdictionRegion data + nested create threading; new updateJurisdictionRegion(regionId, contactFields) (contact-fields-only, immutable country/region, 404 if missing, GLOBAL). index.ts exports updateJurisdictionRegion as coreUpdateJurisdictionRegion. Act-level authority field untouched. npm run build 0 errors; migration applied to gracie_uat_mirror (5 cols confirmed). Branch feature/jurisdiction-authority-contacts, no version bump, no merge, no UAT deploy.

## Deploy Lessons
1. Core `.env` injects 0 vars at runtime — any prisma/migration command on the server MUST pass an explicit `DATABASE_URL` or it finds no connection string.
2. Core deploys require SCP of BOTH `dist` AND `prisma/migrations` — dist-only leaves migrations unrun, and `prisma migrate status` will falsely report "up to date".

## Backlog
- Remove the vestigial `functionId` params (`resolveFunctionScope`, `updateUser`) in a future Core tidy-up.
