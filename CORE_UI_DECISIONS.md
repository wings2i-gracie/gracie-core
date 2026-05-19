# GRACie Core — UI & UX Decisions Reference

> **Purpose:** Captures UI/UX decisions for Core platform capabilities, derived from
> comparing GRACie Privacy (v1) and GRACie Audit implementations. To be referenced
> when drafting Claude Code prompts for Phase 2 extraction sessions (E2.x).
>
> **Owner:** Wings2i Architecture  
> **Created:** May 2026  
> **Update policy:** Add decisions here as new comparisons are made. Reference this
> file in E2.x session briefs — do not reconstruct from memory.

---

## Users & Roles — E2.1 / E2.2

**Two-block layout on one page:**

**Block 1 — User accounts**
- Summary line: "{N} active · {N} pending invitation"
- Table columns: User (avatar + name + email) · Role (colour-coded badge) · Function ·
  Last Active · Status
- Row actions: Edit · Reset password · Deactivate / Reactivate
- Top-right actions: Import users (CSV bulk) · + Create user (direct password) ·
  + Invite user (email)
- "Create user" and "Invite user" are separate flows — Create for when SMTP is not
  configured (sets password directly, must_change_password=true); Invite for email flow

**Block 2 — Role definitions & permissions**
- Role definition cards: one card per role, showing role name badge (colour-coded),
  one-line description, capability pills summarising key permissions
  (read-only reference — not editable here)
- Permissions Matrix below cards: module rows × role columns, Access + Edit toggles
  per cell, configurable per tenant, super_admin + org_admin immutable
- Product filter pill row above matrix: "All · Privacy · Audit · Risk · ..."
  (required once multiple products register module keys into Core)

**Sources:** Role cards → Audit. User table columns + Import + Reset password → Audit.
Permissions Matrix engine → Privacy. Create user (direct) → Privacy S-TENANT-LOCAL-ADMIN-FIX.

---

## Auth & SSO — E2.1

**Three-block layout:**

**Block 1 — Local Auth** (always active, non-removable)
- Minimum password length — configurable (default 8)
- Password complexity (uppercase + number + symbol) — toggle
- Multi-factor authentication (TOTP / Google Authenticator compatible) —
  Off / Optional for users / Required for all
- Session timeout (idle) — configurable (default 30 minutes)

**Block 2 — SAML 2.0 Identity Providers**
- Supports multiple SAML providers simultaneously
- Pre-seeded provider types: Azure AD (ADFS), Okta, custom SAML IdP
- Empty state: "No SAML providers configured yet"
- + Add SAML IdP button

**Block 3 — OAuth 2.0 / OpenID Connect Providers**
- Pre-seeded inactive rows: Google Workspace (OIDC), Microsoft (OIDC),
  Custom OIDC endpoint
- Each row: provider name · status badge (Active / Inactive) · Configure button
- Test connection button per configured provider
- Login page preview panel showing how configured methods appear to end users

**Core-specific addition:**
- Prominent notice: "This SSO configuration applies to all GRACie products
  for this tenant. Changes affect login across Privacy, Audit, and all
  other licensed products."

**Sources:** Three-block structure + Local Auth settings + pre-seeded OIDC rows → Audit.
Test connection + login preview → Privacy. Suite-wide scope notice → Core-specific.

---

## Notifications — E2.7

**Two-block layout:**

**Block 1 — Notification channels** (tenant-level configuration)
- In-tool notifications: always on, non-toggleable (bell icon in topbar)
- Email notifications: on/off toggle (requires SMTP configured in Email Settings)
- Microsoft Teams: webhook URL field + Test button
- Slack: webhook URL field + Test button

**Block 2 — Notification event rules**
- Product filter pill row at top: "All · Privacy · Audit · Risk · ..."
  (required for multi-product — event list will have 20+ events across products)
- Each event row:
  - Event name (bold) + module sub-label below in muted text
    e.g. "Audit created / modified" / "Audit Plan"
  - Channel badges: Email | In-tool (showing which channels are active for this event)
  - Recipients summary (e.g. "Auditors · Auditees · Admin Mgr")
  - Master on/off toggle
  - Edit button → modal to configure channels + recipient roles for this event
- Events are registered by products via ProductRegistration.notificationEvents —
  Core does not hardcode any product-specific events

**Removed from this tab (relocated):**
- Since Your Last Login threshold → move to Dashboard settings

**Sources:** Two-block structure + channel badges + per-event Edit with recipient config → Audit.
Teams integration → Privacy. Slack → Audit addition. Product filter → Core-specific.

---

## Backup & Restore — Core Admin (phase TBD)

**Two-block layout:**

**Block 1 — Automated backup configuration**
- Backup frequency: configurable (default: Daily — 02:00 IST), Edit button
- Backup retention: configurable (default: 90 days), Edit button
- Encryption: AES-256 applied to all backup files — always enabled,
  non-toggleable status badge (tenants cannot disable encryption)
- Action buttons: "Take backup now" (primary) · "Download last backup" (secondary)

**Block 2 — Backup history**
- Table: Date/time · Size · Status · Triggered by (scheduled / manual) · Actions
- Row actions: Download · Restore
- Restore triggers a confirmation dialog with explicit warning

**Core-specific additions:**
- Scope notice at top of tab: "Backup covers all GRACie products and platform
  data for this tenant."
- Restore confirmation dialog must name which products and data are affected

**Sources:** Config block + frequency/retention/encryption rows + history table → Audit.
Restore per history row → Privacy spec. Scope notice + restore warning → Core-specific.

---

## Cross-cutting pattern (applies to all Core admin tabs)

All four comparisons point to the same principle:

> **Audit has better operational UX surface.
> Privacy has better configurable engine depth.
> Core takes Audit's UI structure and Privacy's configurable engines.**

When drafting E2.x session briefs, default to Audit's visual layout and
column/field choices for the admin UI, and Privacy's data model and
configurability for the underlying engine.

---

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| May 2026 | SSO: adopt Audit's three-block structure | Cleaner protocol separation; Local Auth as explicit block is correct |
| May 2026 | SSO: keep Privacy's test connection + login preview | Operationally useful; missing from Audit |
| May 2026 | Notifications: adopt Audit's two-block Channels/Rules separation | Channel config is a separate concern from event rules; scales to N channels |
| May 2026 | Notifications: add Slack | Audit has it; Privacy only has Teams; both should be in Core |
| May 2026 | Notifications: add product filter on rules list | 20+ events from multiple products need filtering |
| May 2026 | Users: add Last Active, pending count, Reset password, Import users | All from Audit; genuine operational gaps in Privacy |
| May 2026 | Users: keep both role cards (Audit) and Permissions Matrix (Privacy) | Cards = readable reference; Matrix = configurable engine. Both needed. |
| May 2026 | Users: add product filter on Permissions Matrix | Module keys registered by multiple products; list will be long |
| May 2026 | Backup: adopt Audit's config block | Clean, correct; frequency/retention/encryption as explicit rows |
| May 2026 | Backup: add Restore per history row | Privacy spec includes it; genuine tenant need; missing from Audit UI |
| May 2026 | Backup: encryption always-on, non-toggleable | Security baseline; tenants must not be able to disable AES-256 |
| May 2026 | Backup/SSO/Notifications: add suite-scope notices | Multi-product Core — tenants must understand config applies across all products |
