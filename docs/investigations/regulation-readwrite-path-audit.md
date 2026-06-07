# Regulation Read/Write Path Audit — Definitive Map

**Date:** 2026-06-07  
**Branch:** fix/superadmin-library-empty  
**Scope:** Read-only audit. No code, schema, or data changes.  
**Builds on:**
- `docs/investigations/CDD1-library-ownership-scope-findings.md`
- `docs/investigations/regulation-table-duplication-findings.md`

---

## A. DATA REALITY

### A1. Row counts (UAT mirror — `gracie_uat_mirror`)

| Table | Row count |
|---|---|
| `core_regulations` | **0** |
| `privacy_regulations` | **3** (GDPR, DPDPA, CCPA — all `status='published'`, all `is_active=false`) |
| `core_tenant_regulation_toggles` | **0** |
| `privacy_tenant_regulation_toggles` | **13** |
| `privacy_compliance_requirements` | **131** |
| `privacy_regulation_documents` | **0** |

**Key facts:**
- `core_regulations` has never been populated on UAT. It was created by the E2.8a migration but the accompanying seed script (`gracie-core/prisma/seed-regulations.ts`) was never run.
- All 13 toggle rows in `privacy_tenant_regulation_toggles` reference `privacy_regulations.id` values. They are consistent with the 3 privacy_regulations rows.
- All 131 compliance requirements have `tenant_id IS NULL` (global/library rows), linked via `regulation_code` string, not FK to either regulation table.
- `privacy_regulation_documents` is also empty — no documents have been uploaded on UAT.

### A2. How `privacy_regulations` was populated

**File:** `prisma/seed.ts` (Privacy repo root)

`privacy_regulations` was seeded directly via the Privacy dev-seed script. The relevant block (lines ~60-90) calls:

```typescript
await prisma.regulation.upsert({
  where: { code: reg.code },
  update: { is_active: reg.is_active },
  create: reg,
});
```

`prisma.regulation` maps to `privacy_regulations` (Privacy's own Prisma model). This seed inserted GDPR, DPDPA, UK_GDPR, and CCPA. UK_GDPR was later removed or not migrated to UAT (not present in the mirror), leaving 3 rows.

`gracie-core/prisma/seed-regulations.ts` exists and is designed to populate `core_regulations`, `core_privacy_principles`, `core_regulation_documents`, and `core_tenant_regulation_toggles` by reading from the Privacy legacy tables and upserting. **This script has never been run on UAT.** Its `main()` prints `[seed-regulations] Starting...` — no evidence of this appearing in any deploy log reviewed.

**Conclusion:** All live regulation data arrived via `prisma/seed.ts` seeding `privacy_regulations` directly. The three regulations were never routed through the write-through bridge (gracie-core write path), which means they do not exist in `core_regulations` at all, and `core_tenant_regulation_toggles` is also empty.

---

## B. EVERY READ PATH — EXHAUSTIVE MAP

The following table covers every function across Privacy and gracie-core that reads regulation identity data. Rows are ordered by path type and status.

### B1. Core-backed read paths (reads `core_regulations`) — **BROKEN on UAT**

| Ref | File:line | Function / endpoint | Ultimately reads | Status |
|---|---|---|---|---|
| R1 | `gracie-core/server/src/modules/regulation/regulation.service.ts:130` | `listRegulations()` | `core_regulations` — raw SQL `SELECT r.* FROM core_regulations r ...` | **BROKEN — returns [] (0 rows)** |
| R2 | `gracie-core/server/src/modules/regulation/regulation.service.ts:146` | `getRegulation(id)` | `core_regulations WHERE r.id = $id` | **BROKEN — 404 for any id** |
| R3 | `gracie-core/server/src/modules/regulation/regulation.service.ts:165` | `listRequirements(regulationId)` (core version — not used directly from Privacy router) | `core_regulations WHERE id = $id` (existence check) | **BROKEN — always throws** |
| R4 | `gracie-core/server/src/modules/regulation/regulation.service.ts:210` | `listRegulationsWithToggles(tenantId)` | `prisma.coreRegulation.findMany(...)` | **BROKEN — returns []** |
| R5 | `gracie-core/server/src/modules/regulation/regulation.service.ts:202` | `getEnabledRegulationsForTenant(tenantId)` | `prisma.coreTenantRegulationToggle.findMany(...).include:{ regulation }` | **BROKEN — toggle table also 0 rows** |
| R6 | `gracie-core/server/src/modules/regulation/regulation.service.ts:442` | `listDocumentsForTenant(tenantId)` | `CoreRegulationDocument` FK-joined to `core_regulations` via toggle | **BROKEN — 0 rows** |
| R7 | `gracie-core/server/src/modules/regulation/regulation.service.ts:463` | `listDocumentsForRegulation(regulationId, tenantId)` | toggle check then `CoreRegulationDocument` | **BROKEN — 0 toggles** |
| R8 | `gracie-core/server/src/modules/regulation/regulation.service.ts:483` | `toggleRegulation(...)` — existence check | `prisma.coreRegulation.findUnique({ where:{ id } })` | **BROKEN — 0 rows, throws** |
| R9 | `server/src/modules/super-admin/regulationLibrary.service.ts:52` | `listRegulations()` — super-admin Library list | delegates to R1 | **BROKEN — super-admin Library shows empty list** |
| R10 | `server/src/modules/super-admin/regulationLibrary.service.ts:56` | `getRegulation(id)` — super-admin Library detail | delegates to R2 | **BROKEN — 404** |
| R14 | `server/src/modules/regulations/regulations.router.ts:17` `GET /api/v1/regulations/derivation-data` | tenant-facing derivation data (country_codes + terminology) | → `svc.listRegulations()` → R1 | **BROKEN — returns []** |
| R15 | `server/src/modules/regulations/regulations.router.ts:34` `GET /api/v1/regulations/` | tenant-facing regulation list | → `svc.listRegulations()` → R1 | **BROKEN — returns []** |
| R16 | `server/src/modules/regulations/regulations.router.ts:43` `GET /api/v1/regulations/:id` | tenant-facing regulation detail | → `svc.getRegulation(id)` → R2 | **BROKEN — 404** |
| R18 | `server/src/modules/regulations/regulations.router.ts:65` `GET /api/v1/regulations/:id/documents` | tenant-facing regulation documents | → `svc.listDocuments(id)` → `coreListDocumentsForRegulation(id)` → R7 | **BROKEN — returns []** |

**Screens served by BROKEN paths:**
- Super-admin → Regulation Library (list page, detail page, create/edit forms all depend on list populating)
- Tenant Regulatory Watch screen (uses `GET /api/v1/regulations/`)
- Organisation setup → jurisdiction/terminology derivation (uses `/derivation-data` — empty → no auto-detection)
- Any regulation detail pages reachable from Regulatory Watch

### B2. Privacy-backed read paths (reads `privacy_regulations`) — **WORKING on UAT**

| Ref | File:line | Function / endpoint | Ultimately reads | Status |
|---|---|---|---|---|
| R11 | `server/src/modules/super-admin/regulationLibrary.service.ts:154` | `listRequirements(regulationId)` | `SELECT code FROM privacy_regulations WHERE id = $id` then `privacy_compliance_requirements WHERE regulation_code = $code` | **WORKING** (but see §D mismatch note) |
| R12 | `server/src/modules/super-admin/regulationLibrary.service.ts:173` | `createRequirement(regulationId, ...)` | `SELECT code FROM privacy_regulations WHERE id = $id` | **WORKING** (but see §D mismatch note) |
| R13 | `server/src/modules/super-admin/regulationLibrary.service.ts:292` | `bulkImportRequirements(regulationId, ...)` | `SELECT code FROM privacy_regulations WHERE id = $id` | **WORKING** (but see §D mismatch note) |
| R17 | `server/src/modules/regulations/regulations.router.ts:54` `GET /api/v1/regulations/:id/requirements` | tenant-facing requirements list | → `svc.listRequirements(id)` → R11 | **WORKING** (but see §D mismatch note) |
| R19 | `server/src/modules/admin/regulations/regulations.service.ts:5` | `listRegulationsWithToggles(tenantId)` | `prisma.regulation.findMany({ where:{ status:'published' } })` → `privacy_regulations` | **WORKING** |
| R20 | `server/src/modules/admin/regulations/regulations.service.ts:29` | `toggleRegulation(...)` — existence check | `prisma.regulation.findUnique({ where:{ id } })` → `privacy_regulations` | **WORKING** |
| R21 | `server/src/modules/organisation/organisation.service.ts:132` | `listRegulationsWithJurisdiction(tenantId)` | `prisma.regulation.findMany({ where:{ status:'published' } })` → `privacy_regulations` | **WORKING** |
| R22 | `server/src/modules/organisation/organisation.service.ts:~152` | `getRegulatoryPosture(...)` | `prisma.tenantRegulationToggle.findMany(...).include:{ regulation }` — FK join `privacy_tenant_regulation_toggles → privacy_regulations` | **WORKING** |
| R23 | `server/src/modules/organisation/organisation.service.ts:236` | `updateRegulationToggle(...)` — existence check | `prisma.regulation.findUnique({ where:{ id } })` → `privacy_regulations` | **WORKING** |
| R24 | `server/src/modules/super-admin/aiIngestion.service.ts:151` | `runAiIngestion(...)` | `SELECT code, name FROM privacy_regulations WHERE id = $id` | **WORKING** |
| R25 | `server/src/modules/compliance/compliance.service.ts:428` | `getOrgRequirements(tenantId)` | `prisma.tenantRegulationToggle.findMany(...).include:{ regulation }` — FK join | **WORKING** |
| R26 | `server/src/modules/breach/breach.service.ts:312` | `resolveRegCodes(regulationIds[])` — called inside breach creation | `prisma.regulation.findMany({ where:{ id:{ in:regulationIds } } })` → `privacy_regulations` | **WORKING** |
| R27 | `server/src/modules/compliance/compliance.service.ts:2103` | `getComplianceDashboardData(...)` — filter resolve | `prisma.regulation.findUnique({ where:{ id:filters.regulationId } })` → `privacy_regulations` | **WORKING** |
| R28 | `server/src/modules/pi-contexts/piContexts.service.ts:1494` | `getEnabledTenantRegulations(tenantId)` — PI Context form regulation dropdown | `prisma.regulation.findMany({ orderBy:{ code:'asc' } })` → ALL rows in `privacy_regulations` | **WORKING** |
| R29 | `server/src/modules/super-admin/canonicalSuggestions.service.ts:71` | `generateCanonicalSuggestions(...)` — loads requirements with regulation names | `LEFT JOIN privacy_regulations r ON r.code = cr.regulation_code` (raw SQL) | **WORKING** |
| R30 | `server/src/modules/super-admin/canonicalSuggestions.service.ts:80` | `generateCanonicalSuggestions(...)` — filter by regulationId | `prisma.regulation.findUnique({ where:{ id:regulationId } })` → `privacy_regulations` | **WORKING** |
| R31 | `server/src/modules/super-admin/canonicalSuggestions.service.ts:383` | `listCanonicalSuggestions(...)` — load regulation names | `prisma.regulation.findMany({ where:{ code:{ in:[...] } } })` → `privacy_regulations` | **WORKING** |
| R32 | `server/src/modules/super-admin/canonicalSuggestions.service.ts:392` | `listCanonicalSuggestions(...)` — filter by regulationId | `prisma.regulation.findUnique({ where:{ id:filters.regulationId } })` → `privacy_regulations` | **WORKING** |
| R33 | `server/src/modules/super-admin/tenants.service.ts:402` | `createTenant(...)` — bootstrap toggle rows for new tenant | `prisma.regulation.findMany({ select:{ id:true } })` → `privacy_regulations` | **WORKING** |

**Additional indirect reads (via `regulation_code` string join — no direct table lookup):**
- `compliance.service.ts` throughout — works from `regulation_code` strings stored on `privacy_compliance_requirements`; never reads regulation rows directly for query filtering (exception: R25, R27 above). These are consistent because requirements were seeded with the same codes as `privacy_regulations`.

---

## C. EVERY WRITE PATH — EXHAUSTIVE MAP

| Ref | File:line | Function | Target table(s) | Working? |
|---|---|---|---|---|
| W1 | `gracie-core/server/src/modules/regulation/regulation.service.ts:268` | `createRegulation(data)` | INSERT `core_regulations`, then bridge INSERT `privacy_regulations ON CONFLICT (code) DO NOTHING` | **BROKEN** — super-admin Library list (R9) returns empty so this path is unreachable from UI |
| W2 | `gracie-core/regulation.service.ts:327` | `updateRegulation(id, data)` | UPDATE `core_regulations` by id; UPDATE `privacy_regulations` by code | **BROKEN** — unreachable from UI (no regulations visible) |
| W3 | `gracie-core/regulation.service.ts:381` | `publishRegulation(id, changelog?)` | UPDATE status/is_active on both tables | **BROKEN** — unreachable |
| W4 | `gracie-core/regulation.service.ts:400` | `deprecateRegulation(id)` | UPDATE status/is_active on both tables | **BROKEN** — unreachable |
| W5 | `gracie-core/regulation.service.ts:416` | `deleteRegulation(id)` | Hard DELETE `core_regulations`, `core_regulation_documents`, `core_tenant_regulation_toggles`; then DELETE `privacy_regulations WHERE code = ...` | **BROKEN** — unreachable |
| W6 | `gracie-core/regulation.service.ts:477` | `toggleRegulation(tenantId, regulationId, ...)` | UPSERT `core_tenant_regulation_toggles` (checks existence in `core_regulations` first) | **BROKEN** — existence check on empty table always throws |
| W7 | `server/src/modules/super-admin/regulationLibrary.service.ts:59` | `createRegulation(data)` (Privacy shim) | delegates to W1 | **BROKEN** — unreachable from UI |
| W8 | `regulationLibrary.service.ts:75` | `updateRegulation(id, data)` | delegates to W2 | **BROKEN** |
| W9 | `regulationLibrary.service.ts:95` | `publishRegulation(id)` | delegates to W3 | **BROKEN** |
| W10 | `regulationLibrary.service.ts:100` | `deprecateRegulation(id)` | delegates to W4 | **BROKEN** |
| W11 | `regulationLibrary.service.ts:115` | `deleteRegulation(id)` | delegates to W5 | **BROKEN** |
| W12 | `server/src/modules/admin/regulations/regulations.service.ts:23` | `toggleRegulation(tenantId, ...)` | UPSERT `privacy_tenant_regulation_toggles` (reads `privacy_regulations` for existence first via R20) | **WORKING** |
| W13 | `server/src/modules/organisation/organisation.service.ts:230` | `updateRegulationToggle(...)` | UPSERT `privacy_tenant_regulation_toggles` (reads `privacy_regulations` for existence first via R23) | **WORKING** |
| W14 | `server/src/modules/super-admin/tenants.service.ts:410` | `createTenant(...)` — bootstrap toggle rows | `prisma.tenantRegulationToggle.createMany(...)` → `privacy_tenant_regulation_toggles` | **WORKING** |
| W15 | `server/src/modules/super-admin/privacyPrinciples.seed.ts:82,92` | `seedRegulationMetadata()` (seed script only) | UPDATE `privacy_regulations SET short_name/authority/effective_date/status/country_codes/terminology WHERE code = 'GDPR'/'DPDPA'` | **WORKING** (seed-invoked only, not live endpoint) |
| W16 | `gracie-core/prisma/seed-regulations.ts` (seed script, never run on UAT) | `main()` | UPSERT `core_regulations`, `core_privacy_principles`, `core_regulation_documents`, `core_tenant_regulation_toggles` from legacy tables | **NOT RUN** — seed exists but has never executed on UAT |

**Note on requirement writes:** Requirement create/update/delete calls in `regulationLibrary.service.ts` (not W-numbered above as they touch `privacy_compliance_requirements`, not regulation identity tables) use `regulationId` from the Privacy API surface. They look up `privacy_regulations WHERE id = $id` (R11-R13) to resolve the regulation code before writing. This is internally consistent with the Privacy table — **but see §D for the dangerous mismatch when this id comes from a core-backed caller.**

---

## D. SYNTHESIS

### D1. BROKEN paths (core-backed, empty on UAT)

The following paths return empty results or throw 404/500 because they ultimately read `core_regulations` (0 rows) or `core_tenant_regulation_toggles` (0 rows):

| Refs | Affected UI / behaviour |
|---|---|
| R1–R10, R14–R16, R18 | Super-admin Regulation Library — list shows nothing, no detail pages reachable, no CRUD operations possible |
| R14 | `GET /derivation-data` returns [] — tenant Organisation Setup cannot auto-detect applicable regulations from location data |
| R15 | `GET /api/v1/regulations/` returns [] — Regulatory Watch tenant-facing regulation list is empty |
| R16 | `GET /api/v1/regulations/:id` returns 404 — regulation detail pages unreachable |
| R18 | `GET /api/v1/regulations/:id/documents` returns [] — no documents shown on any regulation |
| W1–W11 | ALL super-admin regulation writes (create/update/publish/deprecate/delete/toggle via core) are functionally unreachable because the Library list is empty; a direct API call would succeed in writing to `core_regulations` but the result would still be invisible to all tenant-facing screens (which read `privacy_regulations`) |

**Status of the four screens known to have been impacted before this audit:**
All four were caused by the same root: R9/R14/R15 returning empty because they chain to `coreListRegulations()` → `core_regulations` (0 rows).

### D2. WORKING paths (privacy-backed)

The following paths work correctly because they read `privacy_regulations` (3 rows) directly:

- **Admin regulation toggles** (R19/R20/W12): org_admin can see and toggle GDPR/DPDPA/CCPA — works.
- **Organisation Setup regulation toggles** (R21/R23/W13): same.
- **PI Context regulation dropdown** (R28): shows all 3 regulations — works.
- **Terminology derivation from enabled regulations** (R22): works because toggle FK points at `privacy_regulations`.
- **Compliance dashboard regulation filter** (R27): works.
- **Breach regulation resolution** (R26): works.
- **Canonical suggestions** (R29–R32): work.
- **New tenant bootstrap** (R33/W14): new tenants get one disabled toggle row per `privacy_regulations` row — works, and creates 3 toggle rows per new tenant (consistent with 13 existing toggle rows across tenants).
- **Requirements** (R11–R13, R17): work, but see §D3.

### D3. Dangerous write/read table mismatch

**CRITICAL MISMATCH 1 — Super-admin CRUD writes to `core_regulations`; ALL tenant-facing reads see only `privacy_regulations`**

If a super-admin were to create a regulation via the Library UI (even if the UI were fixed to show the list), the write path (W1 → W7) would:
1. INSERT a new row into `core_regulations` with a new UUID (`core_reg_id_NEW`).
2. Bridge-INSERT into `privacy_regulations` with a **different** new UUID (`priv_reg_id_NEW`) — the bridge uses `gen_random_uuid()` independently.

The new regulation would then be visible to:
- `coreListRegulations()` (R9) — super-admin Library list — **visible** (via `core_regulations`).
- Tenant admin/org screens (R19, R21) — **visible** (via `privacy_regulations` bridge copy).

**However:** Any client that received `core_reg_id_NEW` from R9/R10 and then calls the requirements endpoint (R11/R17 — `GET /api/v1/regulations/:id/requirements`) would pass `core_reg_id_NEW` as the `:id`. `listRequirements` does `SELECT code FROM privacy_regulations WHERE id = ${regulationId}::uuid`. Since `core_reg_id_NEW ≠ priv_reg_id_NEW`, this lookup returns 0 rows → throws "Regulation not found". **Requirements are unreachable for any regulation created via the super-admin UI.**

This mismatch also affects `createRequirement` (W-path): the super-admin Library form would try to add requirements to `core_reg_id_NEW`, which resolves correctly to nothing in `privacy_regulations`. Requirements would be silently rejected.

**CRITICAL MISMATCH 2 — `privacyPrinciples.seed.ts` bypasses the bridge entirely**

`seedRegulationMetadata()` (W15) UPDATEs `privacy_regulations` directly by code. It does NOT write to `core_regulations`. If this seed is ever re-run after a regulation is created via the write bridge (W1), the `core_regulations` row would have stale `short_name`, `authority`, `country_codes`, and `terminology` — while `privacy_regulations` has the updated values. Since tenant-facing reads all hit `privacy_regulations`, they would see the seeded values. The super-admin Library (R9) would see the stale values. Low probability of occurring before the core population question is resolved, but structurally present.

**MISMATCH 3 — New tenant regulation toggle bootstrap (W14) reads `privacy_regulations`**

`createTenant()` bootstraps disabled toggle rows by reading all `privacy_regulations` rows (R33), creating one `privacy_tenant_regulation_toggles` row per regulation. This is internally correct: both the toggle write and the regulation existence check are on the Privacy table family. However, if regulations were later added via the super-admin write path (W7/W1), the bridge would add them to `privacy_regulations` but new tenants would get toggle rows for them only if `createTenant` is called after the bridge inserts. Existing tenants would get no toggle rows for bridged-new regulations unless the admin explicitly toggles them.

---

## E. STRATEGIC OPTIONS (High-level — no implementation)

Two clean resolution paths exist. They are mutually exclusive at the strategic level; the choice determines the entire execution sequence.

---

### Option i — UNWIND: Revert all core-backed paths to `privacy_regulations`

**What this means:** Treat the Core regulation migration (E2.8a) as not-yet-started for regulation identity reads. Every read and write path in Privacy goes back to reading/writing `privacy_regulations` directly. The `core_regulations` table continues to exist (E2.8a migration stays) but is left empty and unused until a future session properly populates it and re-migrates reads.

**What must change:**

| File | Change |
|---|---|
| `server/src/modules/super-admin/regulationLibrary.service.ts` | Remove imports of `coreListRegulations`, `coreGetRegulation`, `coreCreateRegulation`, etc. Replace `listRegulations()` and `getRegulation(id)` with direct `prisma.regulation` queries. Replace write functions (create/update/publish/deprecate/delete) with direct `privacy_regulations` writes. |
| `server/src/modules/regulations/regulations.router.ts` | Inherits the fix from `regulationLibrary.service.ts` — no direct change needed once the service is unwound. |
| `gracie-core/server/src/modules/regulation/regulation.service.ts` | Leave in place (not called by Privacy after unwind). Optionally document as "not yet active". No code change needed. |
| `gracie-core/prisma/seed-regulations.ts` | Leave untouched — this becomes the forward migration script for Option ii in a future session. |

**What does NOT need to change:**
- R19, R21, R22, R23, R24, R25–R33: already reading `privacy_regulations` — these are unaffected and remain working.
- Toggle tables: no change. `privacy_tenant_regulation_toggles` stays authoritative per the architecture rule.
- Requirements (R11–R13, R17): already reading `privacy_regulations` — mismatch (§D3) disappears because the list/get will now also return `privacy_regulations` ids.
- The write-through bridge in gracie-core: with unwind, Privacy writes go direct to `privacy_regulations` only; the bridge in gracie-core becomes dormant but is not removed (it belongs to the Core codebase, not Privacy).

**Main risks:**
- The super-admin Library becomes Privacy-only code again. When Option ii is eventually executed (populate Core and move everything), this code must be updated a second time.
- Direct writes to `privacy_regulations` bypass the bridge, so `core_regulations` drifts further from `privacy_regulations`. That drift is acceptable if the long-term plan is Option ii, because `seed-regulations.ts` can re-sync at any time before Option ii executes.
- `privacyPrinciples.seed.ts` (W15) already writes `privacy_regulations` directly — no change needed; it stays consistent.
- **No data migration required.** All existing data is already in `privacy_regulations`. Row counts and existing toggles/requirements are unaffected.
- **Zero risk to tenant data.** The 13 toggle rows, 131 requirements, and all compliance tracking data are unaffected.

---

### Option ii — COMPLETE: Populate `core_regulations` and move ALL paths (read AND write) to Core

**What this means:** Run `seed-regulations.ts` (or equivalent) to populate `core_regulations` from `privacy_regulations`. Then migrate every direct `privacy_regulations` reader (R11–R13, R19–R33) to go through gracie-core service calls. Then retire `privacy_regulations` (per the regulation-table-duplication findings recommendation).

**What must change:**

*Phase 1 — Populate `core_regulations`:*
- Run `gracie-core/prisma/seed-regulations.ts` on UAT (and every environment). This is an idempotent upsert. The bridge has never run on UAT, so IDs in `core_regulations` will be new UUIDs distinct from `privacy_regulations` IDs. Toggle rows for `core_tenant_regulation_toggles` will also be seeded.

*Phase 2 — Migrate read bypasses:*
- `admin/regulations/regulations.service.ts` (R19, R20, W12): replace `prisma.regulation` reads with core service calls; decide whether toggle writes go to `privacy_tenant_regulation_toggles` (current) or `core_tenant_regulation_toggles` (new). **Toggle table unification is a prerequisite or co-requisite** — cannot migrate writes until the toggle table question is resolved.
- `organisation/organisation.service.ts` (R21–R23, W13): same.
- `piContexts.service.ts` (R28): replace `prisma.regulation.findMany` with core service call.
- `breach.service.ts` (R26): replace `prisma.regulation.findMany` with core service call.
- `compliance.service.ts` (R25, R27): replace `prisma.regulation` reads with core service calls.
- `canonicalSuggestions.service.ts` (R29–R32): replace direct reads with core service calls.
- `tenants.service.ts` (R33, W14): replace `prisma.regulation.findMany` with core service call; replace `prisma.tenantRegulationToggle.createMany` with core toggle call.
- `aiIngestion.service.ts` (R24): replace raw SQL on `privacy_regulations` with core service call.
- `regulationLibrary.service.ts` (R11–R13): replace `SELECT code FROM privacy_regulations WHERE id = $id` with core service call — **but must use `core_regulations.id` consistently**, which requires that the super-admin Library UI always passes `core_regulations.id` (it does, via R9/R10 which already read Core).

*Phase 3 — Child-FK re-keying (prerequisite for `privacy_regulations` retirement):*
- `privacy_pi_legal_bases.regulation_id` → re-key from `privacy_regulations.id` to `core_regulations.id`
- `privacy_pi_context_regulations.regulation_id` → same
- `privacy_regulation_documents.regulation_id` → same (all 0 rows on UAT currently)
- Re-keying requires a lookup table: `privacy_regulations.code → core_regulations.id`

*Phase 4 — Bridge removal + `privacy_regulations` drop:*
- Remove bridge writes from all 5 functions in `gracie-core/regulation.service.ts`
- Remove `privacyPrinciples.seed.ts` dependency on `privacy_regulations`
- Drop `privacy_regulations` in a Privacy migration
- Remove Privacy's `Regulation` Prisma model

**Main risks:**
- **High complexity.** This is a multi-phase data migration + multi-file code change touching ~15 files across Privacy and gracie-core.
- **ID mismatch footgun.** After seed-regulations.ts runs, there will be a period where both tables exist and IDs are NOT interchangeable. Any code that accidentally mixes `privacy_regulations.id` with a `core_regulations` lookup (or vice versa) silently returns not-found. This window must be minimised.
- **Toggle table unification.** `privacy_tenant_regulation_toggles` (FK → `privacy_regulations.id`) cannot be migrated to FK → `core_regulations.id` until Phase 1 + Phase 3 are complete. The architecture rule in CLAUDE.md explicitly keeps the two toggle tables separate for now. This may require a new migration and explicit sign-off.
- **UAT data volume.** On UAT: `privacy_pi_legal_bases` and `privacy_pi_context_regulations` may have rows — not counted in this audit but plausibly tens to hundreds. The re-keying migration must run correctly on live data.
- **Two-session minimum.** Phase 1 (populate Core) can be done alone and is low-risk. Phases 2–4 should be a dedicated session with full smoke-testing before UAT deploy.

---

## F. Decision Summary

| Dimension | Option i (UNWIND) | Option ii (COMPLETE) |
|---|---|---|
| Complexity | Low — ~1 file changed in Privacy | High — ~15 files + data migration |
| Risk to tenant data | None | Medium (ID re-keying migration) |
| Time to unblock UAT | Immediate (1 session) | 2–3 sessions minimum |
| Technical debt created | Defers Core migration; bridge drifts further | Eliminates all legacy regulation debt |
| Prerequisite for C-DD1 (owner-scope) | Neither option is a prerequisite; C-DD1 should wait until Option ii is complete | Option ii resolves all bypasses that C-DD1 also requires |
| Compatibility with CLAUDE.md rule on toggle tables | Fully compatible — privacy tables remain authoritative | Requires toggle table unification decision (new architecture decision) |

**Blocking question for Vinod before any action:**

> Is the correct next step (a) unwind all core-backed regulation reads back to `privacy_regulations` as a fast unblock, intending to complete the Core migration in a future dedicated session; or (b) commit now to fully populating `core_regulations` and migrating all paths in a multi-session effort?

Either option is safe. Option i is reversible — it does not foreclose Option ii. Option ii, once started (especially after child FK re-keying), is harder to unwind.

---

*This audit file is the only output of this session. No code, schema, or data was changed.*
