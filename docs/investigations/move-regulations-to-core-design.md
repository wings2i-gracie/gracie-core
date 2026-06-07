# Move Regulations into Core — End-State Design

**Date:** 2026-06-07  
**Status:** DRAFT — awaiting human approval before any build begins  
**Session:** S-MOVE-REG-DESIGN (read-only checkpoint)  
**Prerequisite for:** C-DD1 tenant-authored frameworks  
**Sources (ground truth):**
- `docs/investigations/regulation-readwrite-path-audit.md` (primary)
- `docs/investigations/CDD1-library-ownership-scope-findings.md`
- `docs/investigations/regulation-table-duplication-findings.md`
- `CLAUDE.md` (root Privacy repo)

---

## Correction to context brief

The context brief stated: *"The Core write bridge mints a DIFFERENT UUID in core_regulations vs privacy_regulations."* This is confirmed correct — the audit (§A3 of duplication-findings.md) shows the `createRegulation` bridge calls `gen_random_uuid()` independently in each table, so the two tables have **different `id` values for the same logical regulation**. This is the root cause of the ID-mismatch footgun.

Everything else in the context brief is confirmed accurate against the audit documents.

---

## 1. Canonical ID Decision

**Decision: `privacy_regulations.id` becomes the single surviving identifier.**

**Reasoning:**

1. All 13 rows in `privacy_tenant_regulation_toggles` reference `privacy_regulations.id`. These are the live toggle records for real tenants on UAT. No row in this table references `core_regulations.id`.

2. All child-table FKs — `privacy_pi_legal_bases.regulation_id`, `privacy_pi_context_regulations.regulation_id`, `privacy_regulation_documents.regulation_id` — reference `privacy_regulations.id`.

3. Every working read path (R11–R33 in the audit) uses `privacy_regulations.id` as the identifier surface, including requirement lookups, compliance filtering, breach resolution, and the PI Context regulation dropdown.

4. `core_regulations` has **0 rows**. It holds no live data. Its ID namespace is currently unused.

**Mechanism:** When populating `core_regulations` (Session A), the seed script must use **explicit `id` values from `privacy_regulations`** — not `gen_random_uuid()`. Each regulation row in `core_regulations` receives the **same UUID** as the corresponding row in `privacy_regulations` (`WHERE code = reg.code`). This is a one-time controlled INSERT, not the existing `seed-regulations.ts` (which generates independent UUIDs and must not be used as-is).

**Consequence of this choice:** Because the IDs will match after seeding, all existing child-table FK values become simultaneously valid against `core_regulations.id` without any UPDATE migration. The FK constraint can be moved from `privacy_regulations` to `core_regulations` in a later migration with zero data changes. This eliminates the child-FK re-keying problem entirely.

**Note:** The existing `gracie-core/prisma/seed-regulations.ts` generates independent UUIDs. It **must not be run** as written. Session A will replace or rewrite this script before executing it.

---

## 2. FK Re-Keying Plan

Because Section 1 adopts the ID-preserving seed strategy, there are **no data-level re-keying updates** needed. The values stored in child tables are already the correct UUIDs — they will simply point at a different parent table once the FK constraint is moved.

The table below documents each FK constraint, what it points at today, and what it must point at in the end-state after `privacy_regulations` retirement.

| Child table | Column | Points at now | End-state target | Data change required? |
|---|---|---|---|---|
| `privacy_tenant_regulation_toggles` | `regulation_id` | `privacy_regulations(id)` | `core_regulations(id)` | **No** — IDs will match after ID-preserving seed |
| `privacy_pi_legal_bases` | `regulation_id` | `privacy_regulations(id)` | `core_regulations(id)` | **No** — IDs will match |
| `privacy_pi_context_regulations` | `regulation_id` | `privacy_regulations(id)` | `core_regulations(id)` | **No** — IDs will match |
| `privacy_regulation_documents` | `regulation_id` | `privacy_regulations(id)` | `core_regulations(id)` | **No** — IDs will match (0 rows on UAT) |
| `core_tenant_regulation_toggles` | `regulation_id` | `core_regulations(id)` | (unchanged — already correct table) | No — this table has 0 rows and is not used by Privacy UI |

**Migration step:** In Session C, a Privacy migration will:
1. DROP CONSTRAINT on each FK (`privacy_tenant_regulation_toggles`, `privacy_pi_legal_bases`, `privacy_pi_context_regulations`, `privacy_regulation_documents`).
2. ADD CONSTRAINT pointing at `core_regulations(id)` with the same `ON DELETE` semantics.

No `UPDATE` statements are needed because the UUID values are identical.

---

## 3. Toggle-Table Resolution

**Decision: `privacy_tenant_regulation_toggles` remains authoritative for all Privacy services. No delegation to gracie-core. The architecture rule in CLAUDE.md is preserved unchanged.**

**Why this works cleanly with a Core-owned regulation:**

The toggle table stores `regulation_id`. After the ID-preserving seed (Section 1), the UUIDs in `regulation_id` are the same as the UUIDs in `core_regulations.id`. The toggle table therefore joins correctly to `core_regulations` by simple equality — no lookup table, no code mapping.

Concretely: `privacy_tenant_regulation_toggles.regulation_id = core_regulations.id` will resolve correctly once the FK constraint is moved in Session C.

**How Core-owned regulations join to the Privacy toggle table (end-state query pattern):**

```sql
-- Tenant regulation list with toggle state (end-state)
SELECT r.id, r.code, r.name, r.jurisdiction,
       t.is_enabled, t.jurisdiction_detail
FROM   core_regulations r
LEFT JOIN privacy_tenant_regulation_toggles t
  ON t.regulation_id = r.id
  AND t.tenant_id = $tenantId
WHERE  r.status = 'published'
  AND (r.owner_scope = 'GLOBAL'
       OR (r.owner_scope = 'TENANT' AND r.tenant_id = $tenantId));
```

The Prisma relation for this query lives in the Privacy Prisma schema — `TenantRegulationToggle` with FK → `core_regulations`. The gracie-core Prisma model (`CoreTenantRegulationToggle`) remains in place for future non-Privacy suite consumers and is not removed.

**Is this technically possible?** Yes. A FK across tables in the same PostgreSQL database is a standard relational constraint. `privacy_tenant_regulation_toggles.regulation_id` can reference `core_regulations(id)` just as it currently references `privacy_regulations(id)`. No delegation to gracie-core service code is required or implied. Privacy code reads `privacy_tenant_regulation_toggles` directly — the difference is only which parent table `regulation_id` points at.

**The architecture rule holds exactly as written:** Privacy services continue to read/write `privacy_tenant_regulation_toggles` directly. Gracie-core continues to own `core_tenant_regulation_toggles` for suite-native consumers. Neither table is retired as part of this project.

---

## 4. Read + Write Migration Sequence

The sequence is ordered to ensure the Regulation Library and Regulatory Watch never break during transition. Each session ends with a UAT deploy and human smoke-test before the next session begins.

### Pre-condition (before Session A starts)
- `privacy_regulations`: 3 rows (GDPR, DPDPA, CCPA), IDs are ground truth
- `core_regulations`: 0 rows
- All WORKING reads (R11–R33) are on `privacy_regulations`
- Super-admin Library reads (R9/R10/R14-R16) are BROKEN (0 rows in core)
- Super-admin write actions (W7–W11) are gated behind `WRITE_GATED` flag

### Session A — Populate core_regulations; fix Library reads; ungate writes

**Goal:** Make the super-admin Regulation Library fully functional. Tenant-facing screens (Regulatory Watch, org toggles, compliance) continue to read `privacy_regulations` — no change to them.

**Steps:**

**A1.** Write a new one-time population script (replacing `seed-regulations.ts`). This script:
- Reads the 3 rows from `privacy_regulations`.
- INSERTs each into `core_regulations` with the **same `id` value** (explicit UUID, not `gen_random_uuid()`).
- Uses `ON CONFLICT (id) DO NOTHING` — safe to re-run.
- Also populates `core_privacy_principles` if the existing seed covered it (check the seed file).
- Does NOT populate `core_tenant_regulation_toggles` (that table remains 0 rows; Privacy UI writes go to `privacy_tenant_regulation_toggles` only).

> **Human checkpoint A:** After running the script, verify in the DB: `SELECT id, code FROM core_regulations` returns 3 rows with the **same UUIDs** as `SELECT id, code FROM privacy_regulations`. Must match exactly before proceeding.

**A2.** Fix the write bridge's ID mismatch. In `gracie-core/regulation.service.ts`, the `createRegulation` function's bridge INSERT currently uses `gen_random_uuid()` for the `privacy_regulations` INSERT. Change it to use the same `id` that was written to `core_regulations`. This is a one-line fix: pass the `core_regulations.id` explicitly in the bridge INSERT instead of letting PostgreSQL generate a new one.

**A3.** Remove the `WRITE_GATED` flag from `RegulationLibraryPage.tsx`. With core_regulations now populated and the ID mismatch in the write bridge fixed, the super-admin Library UI can Create/Edit/Publish/Deprecate/Delete regulations.

**A4.** Verify requirement lookups (R11/R17) work end-to-end. The requirement path reads `privacy_regulations WHERE id = $id` to resolve the code. The `$id` that comes from the UI is now a `core_regulations.id` value — which is **the same UUID** as `privacy_regulations.id` after the ID-preserving seed. This lookup therefore succeeds without any code change. **No code change needed for R11–R13.**

> **Human checkpoint B (UAT smoke-test):** Deploy. Verify: (1) Super-admin Library lists 3 regulations. (2) Click into GDPR → requirements tab shows requirements. (3) Regulatory Watch tenant screen still works (R19 path, unchanged). (4) Org Setup regulation toggles still work (R21/W13, unchanged). Session A ends here.

---

### Session B — Migrate bypass readers to Core service

**Goal:** Eliminate all direct reads of `privacy_regulations` from Privacy services, so `privacy_regulations` has no active readers and can be retired.

**Reads to migrate (in order of risk):**

**B1.** `admin/regulations/regulations.service.ts` (R19/R20/W12):
- Replace `prisma.regulation.findMany({ where:{ status:'published' } })` with a call to the gracie-core `listRegulations()` service function.
- Replace `prisma.regulation.findUnique({ where:{ id } })` existence check with a gracie-core `getRegulation(id)` call.
- W12 (toggle write to `privacy_tenant_regulation_toggles`) is **not changed** — the toggle table is unchanged per Section 3.

**B2.** `organisation/organisation.service.ts` (R21/R22/R23/W13):
- Replace `prisma.regulation.findMany(...)` (R21) with gracie-core `listRegulations()`.
- R22 (`prisma.tenantRegulationToggle.findMany(...).include:{ regulation:true }`) currently joins `privacy_tenant_regulation_toggles → privacy_regulations`. After Session C (FK move), this join works against `core_regulations`. In Session B, leave R22 unchanged — the FK still points at `privacy_regulations` which still exists.
- R23 existence check → gracie-core `getRegulation(id)`.
- W13 toggle write: **not changed**.

**B3.** `super-admin/aiIngestion.service.ts` (R24):
- Replace raw SQL `SELECT code, name FROM privacy_regulations WHERE id = $id` with a gracie-core `getRegulation(id)` call (returns `code` and `name`).

**B4.** `super-admin/canonicalSuggestions.service.ts` (R29–R32):
- Replace `prisma.regulation.findMany(...)` and `prisma.regulation.findUnique(...)` calls with gracie-core service calls.
- The raw SQL join in R29 (`LEFT JOIN privacy_regulations r ON r.code = cr.regulation_code`) can be replaced by a code-level join: fetch requirements, then fetch regulations by code from core service.

**B5.** `compliance/compliance.service.ts` (R25/R27):
- R25: `tenantRegulationToggle.findMany(...).include:{ regulation:true }` — same as R22; leave the Prisma relation intact; do not change until FK is moved in Session C.
- R27: `prisma.regulation.findUnique({ where:{ id } })` → gracie-core `getRegulation(id)`.

**B6.** `breach/breach.service.ts` (R26):
- Replace `prisma.regulation.findMany({ where:{ id:{ in:regulationIds } } })` with gracie-core `getRegulation(id)` calls (or a `listRegulations` call filtered by id).

**B7.** `tenants/tenants.service.ts` (R33/W14):
- R33: replace `prisma.regulation.findMany({ select:{ id:true } })` with gracie-core `listRegulations()`.
- W14 (toggle bootstrap writes to `privacy_tenant_regulation_toggles`): **not changed**.

**B8.** `super-admin/regulationLibrary.service.ts` (R11–R13):
- These already work after Session A (same IDs). Optionally migrate to use gracie-core `getRegulation(id)` to resolve the code, eliminating the last direct `privacy_regulations` read in this file. Low risk to defer to Session C.

> **Human checkpoint C:** After Session B, confirm there are **no remaining references** to `prisma.regulation` (Privacy's Regulation model) in the Privacy server source except the Prisma schema file itself and `R22/R25` (which still use the FK join and are handled in Session C). Run: `grep -rn "prisma\.regulation" server/src/` — result should show only toggle-table joins. Deploy to UAT and smoke-test all regulation-touching screens.

---

### Session C — Move FK constraints; retire privacy_regulations

**Goal:** Drop `privacy_regulations` and remove the bridge.

**Steps:**

**C1.** Move FK constraints in a single Privacy migration:
```sql
-- For each of the four child tables:
ALTER TABLE privacy_tenant_regulation_toggles
  DROP CONSTRAINT privacy_tenant_regulation_toggles_regulation_id_fkey,
  ADD CONSTRAINT privacy_tenant_regulation_toggles_regulation_id_fkey
    FOREIGN KEY (regulation_id) REFERENCES core_regulations(id);

-- Repeat for privacy_pi_legal_bases, privacy_pi_context_regulations,
--              privacy_regulation_documents
```
No data UPDATE required (IDs match per Section 1 decision).

**C2.** Update Prisma Privacy schema:
- Remove the `regulation Regulation` relation from `TenantRegulationToggle`, `PiLegalBasis`, `PiContextRegulation`, `RegulationDocument` models.
- These models' `regulation_id` columns become plain UUID columns with no Prisma relation (the FK constraint still exists at DB level but Privacy's Prisma client no longer models it — Privacy code now goes through gracie-core service to resolve regulation data).
- R22/R25 (the `include:{ regulation:true }` patterns): rewrite these to do a two-step fetch — first load toggle rows, then batch-fetch regulation details from gracie-core service by ID.

**C3.** Remove bridge writes from `gracie-core/regulation.service.ts`:
- In `createRegulation`, `updateRegulation`, `publishRegulation`, `deprecateRegulation`, `deleteRegulation`: remove all `$executeRaw`/`$executeRawUnsafe` calls that write to `privacy_regulations`.

**C4.** Remove Privacy's `Regulation` Prisma model from `prisma/schema.prisma`.

**C5.** Add a Privacy migration to drop `privacy_regulations`:
```sql
DROP TABLE IF EXISTS privacy_regulations;
```

> **Human checkpoint D (final):** Verify `privacy_regulations` is gone. Verify all regulation-touching screens work on UAT. Verify `core_regulations` has 3 rows. Run the full smoke test suite. Session C ends here.

---

## 5. C-DD1 Forward-Compatibility

C-DD1 will add `owner_scope` (GLOBAL | TENANT) and a nullable `tenant_id` to `core_regulations`. The schema must be shaped correctly now so that C-DD1 is a data/UI step with no second migration on this table.

**Target `core_regulations` shape to adopt in Session A (alongside populating rows):**

Add these two columns in the Session A migration:

```sql
-- In a gracie-core Prisma migration added alongside the population script:

ALTER TABLE core_regulations
  ADD COLUMN owner_scope TEXT NOT NULL DEFAULT 'GLOBAL',
  ADD COLUMN tenant_id UUID DEFAULT NULL;

ALTER TABLE core_regulations
  ADD CONSTRAINT core_regulations_scope_check
    CHECK (
      (owner_scope = 'GLOBAL' AND tenant_id IS NULL)
      OR
      (owner_scope = 'TENANT' AND tenant_id IS NOT NULL)
    );

CREATE INDEX core_regulations_scope_tenant_idx
  ON core_regulations (owner_scope, tenant_id);
```

All 3 existing rows receive `owner_scope = 'GLOBAL'`, `tenant_id = NULL` by the DEFAULT. No data migration required for existing rows.

**Prisma model addition (gracie-core `schema.prisma`):**

```prisma
model CoreRegulation {
  // ... existing fields ...
  owner_scope  String  @default("GLOBAL")   // 'GLOBAL' | 'TENANT'
  tenant_id    String? @db.Uuid
  // ... existing relations ...
}
```

**code uniqueness:** `core_regulations` currently has `UNIQUE(code)`. With tenant-scoped frameworks, two tenants could want the same code string. For now (this project), **leave the UNIQUE(code) constraint in place** — it is safe for GLOBAL regulations (which must be globally unique by definition). The C-DD1 design session will decide whether to keep global uniqueness, enforce it only within each scope, or require a tenant-prefix convention. Do not change the constraint in this project.

**What this means for C-DD1:** Adding `owner_scope` and `tenant_id` columns in Session A means C-DD1 does NOT need a schema migration on `core_regulations`. Its work reduces to: (a) UI for creating TENANT-scoped regulations, (b) scope-filter clause in service reads, (c) access control for who can create. No table alterations.

---

## 6. privacy_regulations Retirement

The retirement feasibility analysis (duplication-findings.md §C8–C9) confirms RETIRE is the correct path. This section records the pre-conditions and safe order.

### Pre-conditions for dropping privacy_regulations

All of the following must be true before `privacy_regulations` can be dropped:

| # | Pre-condition | Verified by |
|---|---|---|
| 1 | `core_regulations` populated with ID-preserving rows | Human checkpoint A (Session A) |
| 2 | All direct `privacy_regulations` readers in Privacy server migrated to core service calls | Human checkpoint C (Session B) |
| 3 | Write bridge removed from gracie-core regulation.service.ts | Session C step C3 |
| 4 | FK constraints on all 4 child tables moved from `privacy_regulations(id)` to `core_regulations(id)` | Session C step C1 |
| 5 | Privacy `Regulation` Prisma model removed | Session C step C4 |
| 6 | No `grep -rn "privacy_regulations"` hit in Privacy migrations (other than the DROP migration itself) | Before executing C5 |
| 7 | UAT smoke-test passes after FK constraint move and before DROP | Human checkpoint D |

### Compat-view rule

`privacy_regulations` is **not covered by any E4.2 compat view**. The E4.2 compat views (`20260528000001_e4_2_compat_views`) cover: `organisations`, `functions`, `locations`, `entities`, `org_stakeholders`. Dropping `privacy_regulations` does not violate the must-not-drop compat-view rule. No new compat view is needed.

### `privacyPrinciples.seed.ts` dependency

`W15` (`seedRegulationMetadata()`) updates `privacy_regulations` directly by code. Before Session C, this seed script must be updated to write to `core_regulations` instead (or removed if the data it sets is already present in the population script). It must not reference `privacy_regulations` after C4 removes the Prisma model.

---

## 7. Session Breakdown

### Session A — Populate + Ungate (1 session)

**Scope:**
- Write the ID-preserving population script; run it (or run it on UAT as part of deploy).
- Add `owner_scope` and `tenant_id` columns to `core_regulations` (gracie-core migration).
- Fix the bridge's UUID generation to use the same `id` (prevents future mismatch on new regulations).
- Remove the `WRITE_GATED` flag from the super-admin Library UI.
- Update `seed-regulations.ts` to use explicit IDs (or replace it with the new script).
- Update `privacyPrinciples.seed.ts` to write `core_regulations` by code (prep for Session C).

> **Human review checkpoint after Session A:** Confirm IDs match. Confirm Library reads work. Confirm all tenant-facing screens (Regulatory Watch, org toggles, PI Context form, compliance dashboard) still read correctly via the `privacy_regulations` path (which has not been changed). Full UAT smoke test.

**Risk level:** Low. No existing working reads are changed. The only change visible to tenants is that `core_regulations` now has rows — which previously caused no breakage because those reads were already BROKEN.

---

### Session B — Bypass reader migration (1 session)

**Scope:**
- Migrate R19–R33 direct `privacy_regulations` readers to gracie-core service calls (steps B1–B8 above).
- No schema changes, no data changes, no FK moves.
- Target: zero remaining `prisma.regulation` usages in Privacy server code except for the toggle-table join patterns (R22/R25) deferred to Session C.

> **Human review checkpoint after Session B:** Run `grep -rn "prisma\.regulation" server/src/` and confirm no hits except R22/R25 toggle-join patterns. Full UAT smoke test across all regulation-touching screens: Regulatory Watch, Organisation Setup regulation toggles, PI Context form, Compliance dashboard, Breach creation, Canonical suggestions.

**Risk level:** Medium. This is the highest-code-volume session (~8 files changed). Each change is a read migration that must be validated end-to-end. Recommended: do in a feature branch with isolated regression testing per service file before merging.

---

### Session C — FK move + privacy_regulations retirement (1 session)

**Scope:**
- Privacy migration: move FK constraints from `privacy_regulations` to `core_regulations` (step C1).
- Rewrite R22/R25 toggle-join queries to use two-step fetch (step C2).
- Remove bridge writes from gracie-core (step C3).
- Remove Privacy `Regulation` Prisma model (step C4).
- Drop `privacy_regulations` (step C5).

> **Human review checkpoint after Session C:** Confirm `privacy_regulations` is gone. Confirm `core_regulations` has 3 rows. Run full UAT smoke test. Verify `\d core_regulations` shows `owner_scope` and `tenant_id` columns. At this point, `privacy_regulations` is retired and `core_regulations` is the single source of truth. C-DD1 can begin.

**Risk level:** Medium-High (structural migration). The FK constraint moves are the riskiest step — they must execute on UAT data without error. Because IDs match (Section 1 decision), no data is invalid. The main failure mode is a remaining undiscovered reference to `privacy_regulations.id` that doesn't resolve after the DROP. The pre-condition checklist in Section 6 guards against this.

---

## Dependency Map

```
Session A (populate core, ungate writes)
  └─ Human checkpoint A+B → must pass before Session B
       └─ Session B (migrate bypass readers)
             └─ Human checkpoint C → must pass before Session C
                  └─ Session C (FK move, retire privacy_regulations)
                        └─ Human checkpoint D → C-DD1 can begin
```

C-DD1 is blocked on Session C completing (and checkpoint D passing). Sessions A and B are prerequisites for C, not for each other in the other order — Session A must complete first because it establishes the canonical IDs that Session B's migrated code paths will reference.

---

*This document is the only output of this session. No code, schema, or data was changed.*
