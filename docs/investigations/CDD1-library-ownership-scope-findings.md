# C-DD1: Library Ownership-Scope — Investigation Findings

**Date:** 2026-06-07  
**Branch:** investigate/cdd1-library-ownership-scope  
**Scope:** Read-only investigation. No code changed.

---

## 1. Schema: Current `core_regulations` Table

**File:** `gracie-core/prisma/schema.prisma` (lines 464–486)  
**Migration:** `gracie-core/prisma/migrations/20260526000004_e2_8a_regulation_library_tables/migration.sql`

### Exact Prisma model definition

```prisma
model CoreRegulation {
  id                  String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  code                String    @unique
  name                String
  short_name          String?
  jurisdiction        String
  authority           String?
  effective_date      DateTime? @db.Date
  description         String?
  status              String    @default("published")
  terminology         Json?
  legal_basis_options Json?
  country_codes       Json?
  changelog           String?
  is_active           Boolean   @default(false)
  created_at          DateTime  @default(now()) @db.Timestamptz
  updated_at          DateTime  @updatedAt @db.Timestamptz

  documents CoreRegulationDocument[]
  toggles   CoreTenantRegulationToggle[]

  @@map("core_regulations")
}
```

### Current indexes (from migration SQL)

| Index | Column(s) |
|---|---|
| `core_regulations_pkey` (PK) | `id` |
| `core_regulations_code_key` (UNIQUE) | `code` |
| `core_regulations_code_idx` | `code` |

### Ownership columns: NONE

There is **no `owner_scope`, `tenant_id`, or any ownership/scoping column** on `core_regulations` today. Every row is implicitly global.

There is also a **parallel legacy table** `privacy_regulations` (mapped via Privacy's `Regulation` Prisma model, `prisma/schema.prisma` line 655) with an identical column shape and no scoping columns. The two tables are kept in sync via a write-through "strangler bridge" in gracie-core's write path (see §3 below).

---

## 2. Every Read Path — COMPLETE LIST

This is the most important section. All sites that query `core_regulations` (or the legacy `privacy_regulations`) for regulation *identity* data (not just toggles or tracking).

### 2a. gracie-core read sites

| # | File | Function | Query | Tenant-filtered? |
|---|---|---|---|---|
| R1 | `gracie-core/server/src/modules/regulation/regulation.service.ts:130` | `listRegulations()` | `SELECT r.* FROM core_regulations r ...` — raw SQL, no tenant filter | **NO — reads all rows globally** |
| R2 | `gracie-core/server/src/modules/regulation/regulation.service.ts:146` | `getRegulation(id)` | `SELECT r.* FROM core_regulations WHERE r.id = $id` — by PK only | **NO — no tenant filter** |
| R3 | `gracie-core/server/src/modules/regulation/regulation.service.ts:165` | `listRequirements(regulationId)` | `SELECT code FROM core_regulations WHERE id = $id` (existence check only) | **NO — no tenant filter** |
| R4 | `gracie-core/server/src/modules/regulation/regulation.service.ts:210` | `listRegulationsWithToggles(tenantId)` | `prisma.coreRegulation.findMany({ where: { OR: [status:'published', is_active:true] } })` | **NO — reads all published globally, then cross-refs toggle table** |
| R5 | `gracie-core/server/src/modules/regulation/regulation.service.ts:202` | `getEnabledRegulationsForTenant(tenantId)` | `prisma.coreTenantRegulationToggle.findMany` with `.include: { regulation: true }` — loads the regulation via FK join | **NO tenant filter on core_regulations itself** (filtered indirectly by toggle enabled state, but full regulation row is read regardless) |
| R6 | `gracie-core/server/src/modules/regulation/regulation.service.ts:442` | `listDocumentsForTenant(tenantId)` | Reads `CoreRegulationDocument` joined to `CoreRegulation` via FK; regulation ids drawn from enabled toggles | **Indirect only** — documents are scoped by toggle, but the regulation row itself is read without scope check |
| R7 | `gracie-core/server/src/modules/regulation/regulation.service.ts:463` | `listDocumentsForRegulation(regulationId, tenantId)` | Checks toggle enabled; then reads `CoreRegulationDocument` by `regulation_id` | OK — toggle gate is present, but only checks `is_enabled`, not scope |
| R8 | `gracie-core/server/src/modules/regulation/regulation.service.ts:483` | `toggleRegulation(tenantId, regulationId, ...)` | `prisma.coreRegulation.findUnique({ where: { id } })` — existence check | **NO tenant filter** |

### 2b. Privacy server-side read sites

| # | File | Function | Query | Tenant-filtered? |
|---|---|---|---|---|
| R9 | `server/src/modules/super-admin/regulationLibrary.service.ts:51` | `listRegulations()` | Delegates to `coreListRegulations()` → R1 above | **NO** |
| R10 | `server/src/modules/super-admin/regulationLibrary.service.ts:55` | `getRegulation(id)` | Delegates to `coreGetRegulation(id)` → R2 above | **NO** |
| R11 | `server/src/modules/super-admin/regulationLibrary.service.ts:154` | `listRequirements(regulationId)` | `SELECT code FROM privacy_regulations WHERE id = $id` — reads **legacy table** directly via Privacy Prisma | **NO** |
| R12 | `server/src/modules/super-admin/regulationLibrary.service.ts:173` | `createRequirement(regulationId, ...)` | `SELECT code FROM privacy_regulations WHERE id = $id` — existence lookup on **legacy table** | **NO** |
| R13 | `server/src/modules/super-admin/regulationLibrary.service.ts:292` | `bulkImportRequirements(regulationId, ...)` | `SELECT code FROM privacy_regulations WHERE id = $id` | **NO** |
| R14 | `server/src/modules/regulations/regulations.router.ts:17` | `GET /derivation-data` | `svc.listRegulations()` → `coreListRegulations()` → R1. No auth filter (checks module access only) | **NO — returns all published to any authenticated tenant** |
| R15 | `server/src/modules/regulations/regulations.router.ts:34` | `GET /` (tenant-facing) | `svc.listRegulations()` → `coreListRegulations()` → R1 | **NO — returns all published to any authenticated tenant** |
| R16 | `server/src/modules/regulations/regulations.router.ts:43` | `GET /:id` (tenant-facing) | `svc.getRegulation(id)` → `coreGetRegulation(id)` → R2 | **NO** |
| R17 | `server/src/modules/regulations/regulations.router.ts:54` | `GET /:id/requirements` | `svc.listRequirements(id)` → R11 on legacy table | **NO** |
| R18 | `server/src/modules/regulations/regulations.router.ts:65` | `GET /:id/documents` | `svc.listDocuments(id)` → `coreListDocuments(id)` (no tenant gate for this path, just `is_visible`) | **NO** |
| R19 | `server/src/modules/admin/regulations/regulations.service.ts:3` | `listRegulationsWithToggles(tenantId)` | `prisma.regulation.findMany({ where: { status: 'published' } })` — reads **legacy `privacy_regulations`** directly via Privacy Prisma, no scope | **NO** |
| R20 | `server/src/modules/admin/regulations/regulations.service.ts:29` | `toggleRegulation(tenantId, ...)` | `prisma.regulation.findUnique({ where: { id } })` — existence check on **legacy table** | **NO** |
| R21 | `server/src/modules/organisation/organisation.service.ts:131` | `listRegulationsWithJurisdiction(tenantId)` | `prisma.regulation.findMany({ where: { status: 'published' } })` — reads **legacy table** directly | **NO** |
| R22 | `server/src/modules/organisation/organisation.service.ts:211` | (active regulations for terminology derivation) | `prisma.tenantRegulationToggle.findMany(...).include: { regulation: true }` — loads regulation rows via FK | **Filtered by toggle only** — not by scope |
| R23 | `server/src/modules/organisation/organisation.service.ts:237` | `updateRegulationToggle(...)` | `prisma.regulation.findUnique({ where: { id } })` — existence check on legacy table | **NO** |
| R24 | `server/src/modules/super-admin/aiIngestion.service.ts:150` | (AI ingestion) | `SELECT code, name FROM privacy_regulations WHERE id = $id` — legacy table | **NO** |
| R25 | `server/src/modules/compliance/compliance.service.ts:428` | `getOrgRequirements(tenantId)` | `prisma.tenantRegulationToggle.findMany(...).include: { regulation: true }` — reads regulation name/code via FK | **Filtered by toggle only** |

### 2c. Indirect reads (regulation code as join key in compliance queries)

The compliance service (`compliance.service.ts`) never reads `core_regulations` or `privacy_regulations` directly for regulation identity. It works from `regulation_code` strings already stored on `privacy_compliance_requirements` and joins through `privacy_tenant_regulation_toggles`. These are not direct read sites on the regulation table, but they *depend on toggle correctness* for scoping — if a tenant's toggle references a private framework they shouldn't see, compliance tracking would inherit that visibility leak.

---

## 3. Every Write Path

| # | File | Function | What is written | Notes |
|---|---|---|---|---|
| W1 | `gracie-core/server/src/modules/regulation/regulation.service.ts:268` | `createRegulation(data)` | INSERT into `core_regulations` + mirror INSERT into `privacy_regulations` | No owner_scope/tenant_id written today |
| W2 | `gracie-core/server/src/modules/regulation/regulation.service.ts:327` | `updateRegulation(id, data)` | UPDATE `core_regulations` + mirror UPDATE `privacy_regulations` | No scope columns |
| W3 | `gracie-core/server/src/modules/regulation/regulation.service.ts:381` | `publishRegulation(id, changelog?)` | UPDATE status/is_active on both tables | No scope columns |
| W4 | `gracie-core/server/src/modules/regulation/regulation.service.ts:400` | `deprecateRegulation(id)` | UPDATE status/is_active on both tables | No scope columns |
| W5 | `gracie-core/server/src/modules/regulation/regulation.service.ts:416` | `deleteRegulation(id)` | Hard DELETE from `core_regulations`, `core_regulation_documents`, `core_tenant_regulation_toggles` + legacy `privacy_regulations` | No scope columns; check: is_enabled must be false for all tenants |
| W6 | `gracie-core/server/src/modules/regulation/regulation.service.ts:477` | `toggleRegulation(tenantId, regulationId, enabled, updatedBy)` | UPSERT `core_tenant_regulation_toggles` | Does an existence check on `core_regulations` before toggle — no scope awareness |
| W7 | `server/src/modules/super-admin/regulationLibrary.service.ts:59` | `createRegulation(data)` | Delegates to `coreCreateRegulation` → W1 | Super-admin only (Privacy shim) |
| W8 | `server/src/modules/super-admin/regulationLibrary.service.ts:75` | `updateRegulation(id, data)` | Delegates to `coreUpdateRegulation` → W2 | Super-admin only |
| W9 | `server/src/modules/super-admin/regulationLibrary.service.ts:95` | `publishRegulation(id)` | Delegates to `corePublishRegulation` → W3 | Super-admin only |
| W10 | `server/src/modules/super-admin/regulationLibrary.service.ts:100` | `deprecateRegulation(id)` | Delegates to `coreDeprecateRegulation` → W4 | Super-admin only |
| W11 | `server/src/modules/super-admin/regulationLibrary.service.ts:115` | `deleteRegulation(id)` | Delegates to `coreDeleteRegulation` → W5 | Super-admin only |
| W12 | `server/src/modules/admin/regulations/regulations.service.ts:23` | `toggleRegulation(tenantId, ...)` | `prisma.tenantRegulationToggle.upsert` on **Privacy's** `privacy_tenant_regulation_toggles` | Legacy path — does NOT go through gracie-core |
| W13 | `server/src/modules/organisation/organisation.service.ts:230` | `updateRegulationToggle(...)` | `prisma.tenantRegulationToggle.upsert` on **Privacy's** `privacy_tenant_regulation_toggles` | Legacy path — does NOT go through gracie-core |

**Note on duplicate toggle tables:** There are **two separate toggle tables** in the suite:
- `core_tenant_regulation_toggles` — authoritative for gracie-core reads (R4, R5, R6, R7, R8)
- `privacy_tenant_regulation_toggles` — used by Privacy's legacy module reads (R19, R21, R22, R23, R25)

As noted in CLAUDE.md, these tables are **not kept in sync**. Privacy is instructed to always read/write `privacy_tenant_regulation_toggles` directly. Any scope filter applied only to the Core toggle table would not affect Privacy's legacy toggle reads.

---

## 4. Existing Service Layer

**There is no single chokepoint today.** The access pattern is:

- **gracie-core** has a single service file (`regulation.service.ts`) that owns all `core_regulations` CRUD and exposes named functions. This IS the logical chokepoint for core-side reads.
- **Privacy (super-admin path)** correctly delegates to gracie-core functions via `@wings2i-gracie/core` import shim in `regulationLibrary.service.ts`. ✓
- **Privacy (tenant-facing path)** in `regulations.router.ts` also delegates to `regulationLibrary.service.ts` → gracie-core. ✓
- **Privacy (admin module path)** `admin/regulations/regulations.service.ts` reads `privacy_regulations` **directly** via Privacy's Prisma client — bypasses gracie-core entirely. **LEAK RISK.**
- **Privacy (organisation module)** `organisation/organisation.service.ts` reads `privacy_regulations` **directly** via Privacy's Prisma client — bypasses gracie-core entirely. **LEAK RISK.**
- **Privacy (aiIngestion)** `super-admin/aiIngestion.service.ts` reads `privacy_regulations` **directly** via raw SQL. **LEAK RISK.**

**Introducing C-DD1 requires migrating the three bypass sites (admin module, organisation module, aiIngestion) to route through the scope-filtered Core service.** The super-admin/regulationLibrary and regulations.router paths are already correctly choked through gracie-core.

---

## 5. Privacy Impact

### How Privacy consumes the Library today

Privacy has two distinct consumption paths:

**Path A — Super-admin (Wings2i staff) facing:**
`super-admin/regulationLibrary.service.ts` fully delegates to gracie-core for all regulation list/get/CRUD. No direct DB access for regulation identity reads. Scope filter would be added here naturally.

**Path B — Tenant-facing (all tenants):**
`regulations.router.ts` (`GET /regulations`, `GET /regulations/:id`, `/derivation-data`) delegates to `regulationLibrary.service.ts` → gracie-core. These endpoints currently return ALL published/active regulations to any authenticated tenant. After C-DD1, they would need to apply the scope filter so that each tenant only sees GLOBAL + their own TENANT-scoped frameworks.

**Path C — Organisation module (tenant):**
`organisation.service.ts` reads `privacy_regulations` directly via `prisma.regulation.findMany({ where: { status: 'published' } })`. This is the `GET /api/v1/org/regulations` endpoint used by the Organisation Setup UI for the regulation toggle page and for terminology derivation. It would continue to return all published rows post-C-DD1 **unless explicitly migrated** — meaning tenants could see each other's private frameworks in the Organisation Setup UI even after C-DD1 is applied to the Core service. **This is the highest-blast-radius leak in Privacy.**

**Path D — Admin module (tenant org_admin view):**
`admin/regulations/regulations.service.ts` reads `privacy_regulations` directly. Used for the tenant admin regulation toggle management screen. Same leak risk as Path C.

### Would C-DD1 change Privacy's results for existing tenants?

**For GLOBAL frameworks:** No change. All existing rows would get `owner_scope = GLOBAL` by migration default. Privacy tenants would continue to see all GLOBAL frameworks unchanged.

**For future TENANT-scoped frameworks:** Tenants would only see their own. The risk is **Paths C and D** (direct legacy table readers) which would continue to return ALL rows unless migrated.

---

## 6. Migration Shape (Described, Not Written)

### Required changes to `core_regulations`

1. **New column `owner_scope`:** `VARCHAR NOT NULL DEFAULT 'GLOBAL'` (or a PostgreSQL enum `core_regulation_scope` with values `GLOBAL`, `TENANT`). Default `GLOBAL` means all existing rows are correctly classified without a data migration.

2. **New column `tenant_id`:** `UUID NULLABLE` — only set when `owner_scope = 'TENANT'`. No FK enforced at DB level (tenants exist in `core_tenants`, but cross-schema FK adds coupling risk; a CHECK constraint is enough). Must be `NULL` for all existing rows (they are GLOBAL).

3. **Constraint:** `CHECK (owner_scope = 'GLOBAL' AND tenant_id IS NULL) OR (owner_scope = 'TENANT' AND tenant_id IS NOT NULL)`.

4. **New index for the scope filter:**  
   `CREATE INDEX core_regulations_scope_tenant_idx ON core_regulations(owner_scope, tenant_id);`  
   This covers the canonical query pattern: `WHERE owner_scope = 'GLOBAL' OR (owner_scope = 'TENANT' AND tenant_id = $callerTenantId)`.

5. **`code` UNIQUE constraint:** Currently enforced globally. After C-DD1, if tenants can create private frameworks, the `code` uniqueness constraint must be re-thought — two tenants could both want a code `CUSTOM-GDPR-EXT`. Options: (a) keep global uniqueness but prefix with tenant slug; (b) change UNIQUE to `UNIQUE(code, owner_scope, tenant_id)`. This needs a design decision (see §7).

6. **Mirror table `privacy_regulations`:** The strangler-bridge write path also mirrors to `privacy_regulations`. This legacy table has no scope columns either. Adding scope columns there (or keeping the mirror in sync) would also need to be decided. If the legacy table is deprecated soon, the mirror may be skippable; if not, it must be extended.

7. **Compat-view rule:** The suite's must-not-drop compat-view rule applies to the privacy-to-core view rename bridging (E4.2 compat views). `core_regulations` was introduced as a new table in E2.8a — it is not one of the E4.2 compat views. No compat-view concern for the `core_regulations` schema change itself. However, the `privacy_regulations` legacy table is read via Privacy's Prisma `Regulation` model and any schema change there would need careful coordination with Privacy's migrations.

---

## 7. Risks & Open Questions

### Leak-risk hotspots (read sites that bypass scope)

| Priority | Site | Risk |
|---|---|---|
| **CRITICAL** | R19 — `admin/regulations/regulations.service.ts:listRegulationsWithToggles` — reads `privacy_regulations` directly | Tenant org-admin toggle UI would show all tenant-authored frameworks from all tenants |
| **CRITICAL** | R21 — `organisation.service.ts:listRegulationsWithJurisdiction` — reads `privacy_regulations` directly | Organisation Setup regulation page shows all scopes |
| **HIGH** | R22, R25 — `tenantRegulationToggle.findMany(...).include: { regulation: true }` — joins through toggle to regulation; no scope filter | Terminology derivation and requirement filtering would be unaffected for enabled frameworks, but if a tenant incorrectly has a foreign-tenant framework toggled on, the leaky compliance data flows here too |
| **HIGH** | R24 — `aiIngestion.service.ts` reads `privacy_regulations` by ID with no scope check | Super-admin-gated but would allow a super-admin to trigger AI processing on any tenant's private framework |
| **MEDIUM** | R14, R15 — `/derivation-data` and `/` tenant-facing endpoints return all published regulations via `coreListRegulations()` — no scope filter | Every tenant would see every other tenant's published private frameworks via the API |
| **LOW** | R1, R2, R3 — Core service `listRegulations()`, `getRegulation()` — these are global admin reads, but called from Privacy tenant-facing endpoints via the shim chain | Acceptable for super-admin context; not acceptable for tenant-facing |

### Design questions requiring Vinod's decision

1. **Should `super_admin` (Wings2i support mode) see ALL tenant-scoped frameworks across all tenants?** If yes, the scope filter must detect super_admin callers and skip the tenant_id clause. If no, support staff cannot assist tenants with their private frameworks via the admin UI.

2. **Code uniqueness across scopes:** Can two tenants define a framework with the same `code`? If no (global uniqueness retained), what is the naming convention for tenant codes (e.g. mandatory prefix `T-{tenantId-prefix}-...`)? If yes, the `UNIQUE(code)` constraint must be dropped and rebuilt as a composite.

3. **What happens to a tenant's private frameworks if the tenant is deleted/archived?** Currently `deleteRegulation` does a hard DELETE. If the tenant is deleted, should their private frameworks be auto-deleted? Soft-deleted? Archived? Transferred?

4. **Toggle semantics for tenant-authored frameworks:** Can a tenant enable another tenant's private framework (if somehow they know the ID)? The scope filter prevents *reading* it, but should `toggleRegulation` also gate on scope ownership?

5. **Who can CREATE a tenant-scoped framework?** Today only super_admin can create regulations (the create endpoint is behind the super-admin router). Extending to tenant-authored frameworks means `org_admin` or `compliance_manager` needs a create path. Does this open a new router, or is the existing endpoint extended?

6. **Migration of the dual toggle table problem:** `core_tenant_regulation_toggles` and `privacy_tenant_regulation_toggles` are independent. Scope filtering applied to one does not propagate to the other. Before C-DD1 ships, one of these tables must be retired and the other made authoritative, otherwise the scope filter can be defeated through the bypassed table. This is a prerequisite, not a consequence, of C-DD1.

7. **`privacy_regulations` legacy table:** Should the strangler bridge continue to mirror tenant-scoped frameworks to `privacy_regulations`? If yes, `privacy_regulations` needs the same `owner_scope` and `tenant_id` columns and every Privacy direct reader must be migrated before C-DD1 goes live. If the legacy table is being retired soon, the migration burden shifts to just removing the direct readers.

---

## Summary: Sites That Must Change Before C-DD1 Is Safe

### gracie-core (3 functions to scope-filter)
- `regulation.service.ts:listRegulations()` — add caller context parameter + scope clause
- `regulation.service.ts:getRegulation(id)` — add scope check (prevent cross-tenant direct-ID access)
- `regulation.service.ts:listRegulationsWithToggles(tenantId)` — already tenant-parameterised; add scope clause to the `coreRegulation.findMany` call

### Privacy (3 bypass files to migrate off direct table reads)
- `server/src/modules/admin/regulations/regulations.service.ts` — replace `prisma.regulation.findMany` with a scoped Core call
- `server/src/modules/organisation/organisation.service.ts` — replace `prisma.regulation.findMany` with a scoped Core call
- `server/src/modules/super-admin/aiIngestion.service.ts` — replace `SELECT ... FROM privacy_regulations` with a scoped Core call

### Privacy (3 `privacy_regulations` raw-SQL lookups using legacy table for requirement resolution)
- `regulationLibrary.service.ts:listRequirements` — `SELECT code FROM privacy_regulations WHERE id = $id`
- `regulationLibrary.service.ts:createRequirement` — same pattern
- `regulationLibrary.service.ts:bulkImportRequirements` — same pattern

These currently look up regulation code from `privacy_regulations` to resolve requirement codes. With scope in play, they should verify the caller has access to the regulation before resolving the code. Low risk today (super-admin only), but should be tightened.
