# Regulation Table Duplication — Design Checkpoint Findings

**Date:** 2026-06-07  
**Branch:** investigate/regulation-table-duplication  
**Scope:** Read-only investigation. No code changed.  
**Builds on:** `docs/investigations/CDD1-library-ownership-scope-findings.md`

---

## A. The Legacy `privacy_regulations` Table

### A1. Current Prisma model

**File:** `prisma/schema.prisma` (Privacy repo), lines 655–679

```prisma
model Regulation {
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

  tenant_toggles       TenantRegulationToggle[]
  pi_legal_bases       PiLegalBasis[]
  pi_context_regs      PiContextRegulation[]
  regulation_documents RegulationDocument[]

  @@map("privacy_regulations")
}
```

### A2. Migration history

| Migration | What it did to `privacy_regulations` |
|---|---|
| `20260420122817_init` | Created original `regulations` table (pre-E4.2 name) |
| `20260421020828_s1_admin_tables` | Created original `tenant_regulation_toggles` with FK → `regulations(id)` |
| `20260525000002_e2_8a_regulation_library_shim_note` | Contained only `SELECT 1`. Comment reads: *"Old tables (regulations, privacy_principles, regulation_documents, tenant_regulation_toggles) are retained (strangler pattern — NOT dropped). Write path remains in Privacy (regulationLibrary.service.ts) — E2.8b."* — confirms the design intent. |
| `20260527000001_e4_2_privacy_table_prefix` | `ALTER TABLE "regulations" RENAME TO "privacy_regulations"` — table renamed; `ALTER TABLE "tenant_regulation_toggles" RENAME TO "privacy_tenant_regulation_toggles"` |
| `20260528000001_e4_2_compat_views` | Does NOT mention `privacy_regulations` — no compat view was created for it (see §C13 below) |

**Implication:** `privacy_regulations` has existed since the project's initial migration. It was the *original* regulation table; `core_regulations` was added in E2.8a as the new authoritative home. The legacy table was kept under the strangler pattern and renamed in E4.2.

### A3. The write-through bridge — mechanism and direction

**File:** `gracie-core/server/src/modules/regulation/regulation.service.ts`

The bridge is **synchronous raw SQL** (`prisma.$executeRaw` / `prisma.$executeRawUnsafe`). It is **one-way: core → privacy only**. Every write to `core_regulations` is immediately followed by an equivalent write to `privacy_regulations` in the same function. There is no reverse path — no code writes to `privacy_regulations` and then mirrors to `core_regulations`.

The bridge covers all five mutating operations:

| Function | Mechanism |
|---|---|
| `createRegulation` (~line 268) | INSERT into `core_regulations` (raw SQL), then `INSERT INTO privacy_regulations ... ON CONFLICT (code) DO NOTHING` |
| `updateRegulation` (~line 327) | `UPDATE core_regulations SET ... WHERE id = $1` then `UPDATE privacy_regulations SET ... WHERE code = $1` — matches by `code`, not `id` |
| `publishRegulation` (~line 381) | `UPDATE core_regulations ... WHERE id = ...` then `UPDATE privacy_regulations ... WHERE code = ...` |
| `deprecateRegulation` (~line 400) | Same pattern as publish |
| `deleteRegulation` (~line 416) | DELETEs from core tables (`core_tenant_regulation_toggles`, `core_regulation_documents`, `core_regulations`), then `DELETE FROM privacy_regulations WHERE code = ...` — comment: *"relies on DB-level CASCADE for legacy child rows"* |

**Key detail:** update/publish/deprecate/delete all **match `privacy_regulations` rows by `code`**, not `id`. The `id` values in the two tables are independent — there is no guarantee they match. This is intentional: the bridge does not synchronise identity, only data. Any direct reader of `privacy_regulations` by `id` (e.g. R11, R12, R13) must use the `privacy_regulations.id` specifically, not the `core_regulations.id`.

### A4. Complete list of remaining `privacy_regulations` direct readers

The following sites read `privacy_regulations` directly, bypassing the `core_regulations` authoritative table. The C-DD1 prior findings catalogued R11–R13, R19, R21, R24; this checkpoint confirms and extends that list.

| Ref | File | Function | Query | Could switch to `core_regulations`? |
|---|---|---|---|---|
| R11 | `server/src/modules/super-admin/regulationLibrary.service.ts:~154` | `listRequirements` | `SELECT code FROM privacy_regulations WHERE id = $id` | **YES** — only needs `code` column, identical in both tables. Must use `privacy_regulations.id` (not `core_regulations.id`) as the input, but given the bridge creates rows with the same `code`, a lookup by `code` via `core_regulations` would work. |
| R12 | `regulationLibrary.service.ts:~173` | `createRequirement` | `SELECT code FROM privacy_regulations WHERE id = $id` | **YES** — same as R11 |
| R13 | `regulationLibrary.service.ts:~292` | `bulkImportRequirements` | `SELECT code FROM privacy_regulations WHERE id = $id` | **YES** — same as R11 |
| R19 | `server/src/modules/admin/regulations/regulations.service.ts:3` | `listRegulationsWithToggles` | `prisma.regulation.findMany({ where: { status: 'published' } })` — Privacy Prisma client, reads full row set | **YES** — but would need to call the gracie-core service function; cannot use Privacy's `prisma.regulation` since that model maps to `privacy_regulations` |
| R20 | `admin/regulations/regulations.service.ts:~23` | `toggleRegulation` (existence check) | `prisma.regulation.findUnique({ where: { id } })` | **YES** — existence check only |
| R21 | `server/src/modules/organisation/organisation.service.ts:131` | `listRegulationsWithJurisdiction` | `prisma.regulation.findMany({ where: { status: 'published' } })` | **YES** — but same caveat as R19; needs core service call |
| R22 | `organisation.service.ts:~152` | `getRegulatoryPosture` | `prisma.tenantRegulationToggle.findMany(...).include: { regulation: true }` — FK join from toggle → `privacy_regulations` | **YES** — but only after the toggle table question is resolved; the FK currently points at `privacy_regulations.id` |
| R23 | `organisation.service.ts:~210` | `getTerminology` | Same FK join as R22 | Same caveat as R22 |
| R24 | `server/src/modules/super-admin/aiIngestion.service.ts:~150` | `runAiIngestion` | `SELECT code, name FROM privacy_regulations WHERE id = $id` — raw SQL | **YES** — only needs `code` and `name`; both identical in `core_regulations` |

**Summary:** Every direct reader of `privacy_regulations` only needs columns that exist identically in `core_regulations`. There is no functional reason they cannot read `core_regulations` instead.

### A5. Column comparison — are the tables truly identical?

**`core_regulations` columns** (from gracie-core `schema.prisma`):  
`id, code, name, short_name, jurisdiction, authority, effective_date, description, status, terminology, legal_basis_options, country_codes, changelog, is_active, created_at, updated_at`

**`privacy_regulations` columns** (from Privacy `schema.prisma`):  
`id, code, name, short_name, jurisdiction, authority, effective_date, description, status, terminology, legal_basis_options, country_codes, changelog, is_active, created_at, updated_at`

**Result: IDENTICAL shape.** Every column name and type is the same. The only difference is in **Prisma relations**:

- `core_regulations` has relations: `CoreRegulationDocument[]`, `CoreTenantRegulationToggle[]`  
- `privacy_regulations` has relations: `TenantRegulationToggle[]`, `PiLegalBasis[]`, `PiContextRegulation[]`, `RegulationDocument[]`

The **Privacy-side relations** (`PiLegalBasis`, `PiContextRegulation`, `RegulationDocument`) represent FK constraints on child tables that reference `privacy_regulations.id`. These FKs are the main structural reason `privacy_regulations` cannot simply be dropped without first migrating those child table FKs to point at `core_regulations` instead.

**Data divergence:** Since the bridge runs synchronously and uses `ON CONFLICT (code) DO NOTHING` on insert (safe against duplicates), the two tables should be in sync for columns covered by the bridge. There is no code that writes to `privacy_regulations` without also writing to `core_regulations` first. However, the `id` values **will differ** between tables for the same logical regulation — the bridge does not preserve the `id` from `core_regulations` when inserting into `privacy_regulations` (the INSERT lets `gen_random_uuid()` generate a new `id`). This means the two tables' `id` columns are **not interchangeable**.

---

## B. The Two Toggle Tables

### B5. Model definitions and shape differences

**`core_tenant_regulation_toggles`** — gracie-core `schema.prisma`, ~line 524:

```prisma
model CoreTenantRegulationToggle {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id           String   @db.Uuid
  regulation_id       String   @db.Uuid
  is_enabled          Boolean  @default(false)
  jurisdiction_detail String?
  updated_by          String   @db.Uuid
  updated_at          DateTime @updatedAt @db.Timestamptz

  regulation CoreRegulation @relation(fields: [regulation_id], references: [id])

  @@unique([tenant_id, regulation_id])
  @@map("core_tenant_regulation_toggles")
}
```

**`privacy_tenant_regulation_toggles`** — Privacy `schema.prisma`, ~line 900:

```prisma
model TenantRegulationToggle {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id           String   @db.Uuid
  regulation_id       String   @db.Uuid
  is_enabled          Boolean  @default(false)
  jurisdiction_detail String?
  updated_by          String   @db.Uuid
  updated_at          DateTime @updatedAt @db.Timestamptz

  tenant     Tenant     @relation(fields: [tenant_id], references: [id], onDelete: Cascade)
  regulation Regulation @relation(fields: [regulation_id], references: [id])
  updater    User       @relation("RegulationToggleUpdater", fields: [updated_by], references: [id])

  @@unique([tenant_id, regulation_id])
  @@map("privacy_tenant_regulation_toggles")
}
```

**Shape differences:**

| Aspect | `core_tenant_regulation_toggles` | `privacy_tenant_regulation_toggles` |
|---|---|---|
| Columns | Identical | Identical |
| FK to regulation | → `core_regulations(id)` | → `privacy_regulations(id)` |
| FK to tenant | **None** | → `privacy_tenants(id)` ON DELETE CASCADE |
| FK to updater | **None** | → `privacy_users(id)` |

The Privacy toggle table has **two additional FK constraints** (`tenant` and `updater`) that the Core toggle table lacks. This means:
- Privacy toggle rows have **referential integrity** against users and tenants enforced at DB level.
- Core toggle rows do not — `updated_by` and `tenant_id` are stored as plain UUIDs.

The `regulation_id` in each table references the **same-table-family** regulation row. Because the `id` values differ between `core_regulations` and `privacy_regulations`, a `regulation_id` value in `core_tenant_regulation_toggles` is **not the same UUID** as the corresponding row's `id` in `privacy_tenant_regulation_toggles`.

### B6. The architecture rule — verbatim

**File:** `C:/Users/vagrasala/Documents/gracie/CLAUDE.md` (project instructions)

The rule exists and reads verbatim:

> **Regulation toggles:** Always read/write `privacy_tenant_regulation_toggles` directly in Privacy
> services. Never delegate regulation toggle operations to gracie-core (which reads
> `core_tenant_regulation_toggles` — a different table not kept in sync).

**This is a real, explicit architecture rule**, not an assumption. It was written to prevent accidental use of the core toggle table in Privacy services. The stated reason is that the two tables are "a different table not kept in sync" — confirming the deliberate separation.

### B7. Sync status — are the two toggle tables kept in sync?

**No. They are completely independent.**

The three toggle write functions each write to exactly one table:

| Write site | Table written | Syncs to other table? |
|---|---|---|
| W6 — `regulation.service.ts:toggleRegulation` (gracie-core) | `core_tenant_regulation_toggles` only | **NO** |
| W12 — `admin/regulations.service.ts:toggleRegulation` (Privacy) | `privacy_tenant_regulation_toggles` only | **NO** |
| W13 — `organisation.service.ts:updateRegulationToggle` (Privacy) | `privacy_tenant_regulation_toggles` only | **NO** |

The tenant-facing UI (Organisation Setup and Admin regulation toggle pages) uses W12 and W13, which write **only to `privacy_tenant_regulation_toggles`**. The gracie-core `toggleRegulation` (W6) is never called from any Privacy tenant-facing endpoint — it is only called via the gracie-core router (if wired) or tests. The core toggle table is therefore **stale relative to what tenants actually have enabled** unless the core toggle router is being called separately (no evidence of that was found).

**Practical consequence:** In the current state, `core_tenant_regulation_toggles` likely has fewer rows than `privacy_tenant_regulation_toggles` — or different values — because all tenant toggle actions in the Privacy UI go through W12/W13. The core toggle table is effectively an orphan for the current Privacy deployment.

---

## C. Retirement Feasibility Analysis

### C8. `privacy_regulations` — RETIRE vs KEEP-AND-EXTEND

#### Option 1: RETIRE `privacy_regulations`

**What is required:**

1. **Migrate child-table FKs.** Three Privacy tables hold FKs referencing `privacy_regulations.id`:
   - `privacy_pi_legal_bases.regulation_id` → `privacy_regulations(id)`
   - `privacy_pi_context_regulations.regulation_id` → `privacy_regulations(id)`
   - `privacy_regulation_documents.regulation_id` → `privacy_regulations(id)`

   These FKs must be remapped to `core_regulations.id`. Because the two tables have **different `id` values** for the same regulation (the bridge generates new UUIDs on INSERT), a data migration is required to re-key each child row: look up `privacy_regulations.code` → `core_regulations.id` and update each child FK. This is a non-trivial data migration on potentially large tables (pi_legal_bases, pi_context_regs).

2. **Migrate all 8 direct readers** (R11–R13, R19–R24) to read `core_regulations` instead. For R11–R13 and R24 (raw SQL lookups), this is straightforward substitution. For R19–R21 (Prisma client reads), Privacy's `prisma.regulation` model maps to `privacy_regulations` — migrating requires either removing that model alias or introducing a core-service call.

3. **Remove the bridge** from all five write functions in `regulation.service.ts` (gracie-core).

4. **Remove Privacy's `Regulation` Prisma model** (or change its `@@map` to point nowhere) and all associated Prisma relations.

5. **Drop `privacy_regulations`** with a migration (after confirming zero remaining references).

**Effort/risk read:**
- **Effort: Medium-High.** The child-FK re-keying migration (step 1) is the hardest part — it's a multi-table UPDATE that must run without downtime. If the tables are large, it needs careful batching.
- **Risk: Medium.** The ID mismatch between tables means the data migration is required; it cannot be skipped. If any code passes `privacy_regulations.id` values to functions that then try to look up by that ID in `core_regulations`, those lookups silently fail (row not found) until migrated. Must audit all callsites for ID provenance.

#### Option 2: KEEP-AND-EXTEND

**What is required:**

1. Add `owner_scope` and `tenant_id` columns to `privacy_regulations` (same as `core_regulations` — two new columns).
2. Ensure the bridge copies `owner_scope` and `tenant_id` when creating/updating regulations.
3. Migrate all 8 direct readers to apply the scope filter (`WHERE owner_scope = 'GLOBAL' OR (owner_scope = 'TENANT' AND tenant_id = $callerTenantId)`).
4. The bridge, the two parallel tables, and the ID mismatch all persist indefinitely.

**Effort/risk read:**
- **Effort: Lower short-term** (just add two columns + update bridge + update 8 readers). 
- **Risk: Higher long-term.** The ID mismatch is a permanent footgun — any developer who accidentally uses a `privacy_regulations.id` where a `core_regulations.id` is expected (or vice versa) gets a silent row-not-found. The bridge is a latent consistency risk: if it fails mid-write (e.g. network partition with an external DB), the tables diverge silently. Adding more columns to mirror increases that surface area.

#### E4.2 compat-view concern for `privacy_regulations`

**`privacy_regulations` is NOT involved in any E4.2 compat view.** The E4.2 compat views (`20260528000001_e4_2_compat_views`) only cover: `organisations`, `functions`, `locations`, `entities`, `org_stakeholders`. The prior C-DD1 findings noted this: *"core_regulations is unaffected."* Confirmed here: `privacy_regulations` also has no compat view. Dropping or altering it does not violate the must-not-drop compat-view rule.

### C9. Dependency order for retirement

If RETIRE is chosen, the sequence is:

1. **Prerequisite A (C-DD1 bypasses):** Migrate R19, R21, R24 off direct `privacy_regulations` reads first (these are the same three bypass sites identified in C-DD1 findings §4 as highest-risk). These three sites also write to `privacy_tenant_regulation_toggles` (W12, W13) — migrating them off the legacy regulation read is independent of the toggle table decision, but must happen before toggle unification (see §C Toggle retirement).

2. **Data migration:** Re-key `privacy_pi_legal_bases`, `privacy_pi_context_regulations`, `privacy_regulation_documents` to use `core_regulations.id`. This requires a lookup table (`privacy_regulations.code` → `core_regulations.id`) built from the bridge-maintained data.

3. **Reader migration:** Update R11–R13 (super-admin requirement lookups) to read `core_regulations` by code instead of `privacy_regulations` by id.

4. **Bridge removal:** Remove the mirror writes from all five write functions in `regulation.service.ts`.

5. **Drop `privacy_regulations`** and the Privacy `Regulation` Prisma model.

**Overlap with C-DD1 Prerequisite A:** The three bypass reads (R19, R21, R24) must be migrated for BOTH C-DD1 scoping AND `privacy_regulations` retirement. They are the same work — doing one accomplishes the other. This makes the combination "C-DD1 + RETIRE" more efficient than "C-DD1 + KEEP-AND-EXTEND" because the bypass migration is required either way.

---

## D. Recommendation

### D10. Per-structure recommendation

#### `privacy_regulations` → **RETIRE**

**Reasoning:**
- The two tables are **column-identical with no data unique to `privacy_regulations`**. There is no value the legacy table provides that `core_regulations` does not already contain.
- The bridge is a synchronous dual-write that introduces a latency-free consistency coupling — but it is still redundant complexity. KEEP-AND-EXTEND would add `owner_scope`/`tenant_id` to both tables and require the bridge to mirror those too, permanently doubling the surface.
- The ID mismatch (different UUIDs for the same logical row) is a structural bug in the bridge's design that gets harder to fix the longer both tables coexist with active FK references.
- The child-FK re-keying migration (the main cost of RETIRE) is a one-time cost. KEEP-AND-EXTEND defers that cost without eliminating it, and the cost grows as more data accumulates in child tables.
- The E4.2 compat-view rule does NOT apply here — no compat view exists for `privacy_regulations`.

**RETIRE is the correct long-term path.** It should be done as a dedicated session (not bundled into C-DD1 feature work) and sequenced: bypass migration → child FK re-keying → bridge removal → drop.

#### `privacy_tenant_regulation_toggles` → **KEEP (authoritative)**; retire `core_tenant_regulation_toggles` or freeze it

**Reasoning:**
- The CLAUDE.md architecture rule explicitly designates `privacy_tenant_regulation_toggles` as the authoritative toggle store for Privacy: *"Always read/write `privacy_tenant_regulation_toggles` directly in Privacy services. Never delegate regulation toggle operations to gracie-core."*
- In practice, ALL tenant-facing toggle writes (W12, W13) go to `privacy_tenant_regulation_toggles`. The core toggle table (`core_tenant_regulation_toggles`) receives no writes from the Privacy UI and is an orphan in the current deployment.
- `privacy_tenant_regulation_toggles` has **stronger referential integrity** (FK to tenant, FK to updater) than the core toggle table. It also holds FK references from `privacy_compliance_requirements` and `privacy_pi_context_regulations` (via FK joins in compliance queries R22, R25, and the compliance service).
- There is no architectural case for migrating Privacy's toggle writes to go through gracie-core's toggle table when the explicit rule says the opposite.

**The toggle tables are SUPPOSED to stay separate.** The architecture rule is correct and should be preserved. The core toggle table (`core_tenant_regulation_toggles`) exists to support future gracie-core-native consumers (other products in the suite that don't share the Privacy DB). For GRACie Privacy specifically, `privacy_tenant_regulation_toggles` is and should remain authoritative.

**Action required before C-DD1:** The scope filter for C-DD1 must be applied to `privacy_tenant_regulation_toggles` reads (R19, R21, R22, R25), NOT to `core_tenant_regulation_toggles`. The prior C-DD1 findings (§7, question 6) flagged this: "before C-DD1 ships, one of these tables must be retired." That conclusion was based on uncertainty about which table is authoritative. **That uncertainty is now resolved: `privacy_tenant_regulation_toggles` is authoritative for Privacy.** The toggle table question does NOT require retirement of either table — it requires applying scope filtering to the correct (Privacy) table's read paths.

### D11. Open questions for Vinod's decision

These questions were partially catalogued in C-DD1 §7 — the items below refine and add to that list specifically in light of the table-duplication findings:

1. **ID mismatch remediation timing.** The child tables (`privacy_pi_legal_bases`, `privacy_pi_context_regs`, `privacy_regulation_documents`) currently hold `privacy_regulations.id` values as FKs. Retiring `privacy_regulations` requires re-keying those to `core_regulations.id`. Is this acceptable to do in a single maintenance window, or does it need to be done in zero-downtime batches? How large are those tables in UAT?

2. **Should RETIRE be a prerequisite for C-DD1, or can C-DD1 ship with KEEP-AND-EXTEND?** The safest path is RETIRE first (removes the legacy leak surface), then add scope columns to `core_regulations`, then ship C-DD1. But that's two sessions before the feature ships. KEEP-AND-EXTEND allows C-DD1 to ship while retirement is deferred — is the extra legacy complexity acceptable?

3. **Core toggle table disposition.** `core_tenant_regulation_toggles` currently has no Privacy UI writes. Should it remain for future suite products, or be documented as a dead table until a non-Privacy consumer adopts it? Should it be kept empty/frozen or populated via a sync from `privacy_tenant_regulation_toggles` for suite-level queries?

4. **Toggle scope filter for C-DD1.** When a tenant enables a regulation, the toggle is written to `privacy_tenant_regulation_toggles`. After C-DD1 adds tenant-scoped frameworks, should the toggle write also validate that the caller has scope access to the regulation being toggled? (Currently neither W12 nor W13 checks `owner_scope` — they just check existence.) This prevents a tenant from toggling on a framework owned by another tenant if they somehow know the `regulation_id`.

5. **Questions from C-DD1 §7 still open:** super_admin visibility of tenant-scoped frameworks (#1), code uniqueness across scopes (#2), framework lifecycle when tenant is deleted (#3), who can CREATE tenant-scoped frameworks (#5). These are unchanged from the prior findings and still require Vinod's decision before C-DD1 implementation begins.

---

## Summary Table

| Structure | Recommendation | Key reason |
|---|---|---|
| `privacy_regulations` | **RETIRE** | Column-identical to `core_regulations`; only liability (ID mismatch, bridge complexity, FK re-keying debt) grows with time |
| Bridge (core → privacy) | **REMOVE** (as part of RETIRE) | No readers remain after RETIRE; bridge is only maintenance burden |
| `privacy_tenant_regulation_toggles` | **KEEP — authoritative for Privacy** | Explicit CLAUDE.md architecture rule; all Privacy UI writes go here; stronger referential integrity |
| `core_tenant_regulation_toggles` | **FREEZE / document** (not retire) | Correct home for future non-Privacy suite consumers; not in conflict with Privacy's authoritative table |
