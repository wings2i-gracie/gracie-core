// E2.8a: Seeds core_regulations, core_privacy_principles, core_regulation_documents,
// and core_tenant_regulation_toggles from existing Privacy tables.
// Idempotent — safe to re-run; uses upsert on unique keys.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../server/src/generated/prisma-client/index.js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// .env is at the Privacy repo root — two directories up from gracie-core/prisma/
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

if (!process.env.DATABASE_URL) {
  console.error('[seed-regulations] DATABASE_URL is not set. Ensure .env exists at Privacy root.');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// ── Row types for old Privacy tables ─────────────────────────────────────────

interface RegRow {
  id: string;
  code: string;
  name: string;
  short_name: string | null;
  jurisdiction: string;
  authority: string | null;
  effective_date: Date | null;
  description: string | null;
  status: string;
  terminology: unknown;
  legal_basis_options: unknown;
  country_codes: unknown;
  changelog: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface PrincipleRow {
  id: string;
  code: string;
  name: string;
  description: string;
  sort_order: number;
}

interface DocRow {
  id: string;
  regulation_id: string;
  title: string;
  doc_type: string;
  source_type: string;
  file_ref: string | null;
  external_url: string | null;
  issuing_authority: string | null;
  version: string | null;
  effective_date: Date | null;
  description: string | null;
  file_size_bytes: number | null;
  page_count: number | null;
  is_visible: boolean;
  sort_order: number;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

interface ToggleRow {
  id: string;
  tenant_id: string;
  regulation_id: string;
  is_enabled: boolean;
  jurisdiction_detail: string | null;
  updated_by: string;
  updated_at: Date;
}

async function main() {
  console.log('[seed-regulations] Starting...');

  // ── 1. Seed core_regulations from regulations ─────────────────────────────
  const regs = await prisma.$queryRaw<RegRow[]>`SELECT * FROM regulations ORDER BY code`;
  console.log(`[seed-regulations] Found ${regs.length} regulation(s) in legacy table`);

  let regCount = 0;
  for (const r of regs) {
    await prisma.coreRegulation.upsert({
      where: { code: r.code },
      create: {
        id: r.id,
        code: r.code,
        name: r.name,
        short_name: r.short_name,
        jurisdiction: r.jurisdiction,
        authority: r.authority,
        effective_date: r.effective_date,
        description: r.description,
        status: r.status,
        terminology: r.terminology ?? undefined,
        legal_basis_options: r.legal_basis_options ?? undefined,
        country_codes: r.country_codes ?? undefined,
        changelog: r.changelog,
        is_active: r.is_active,
        created_at: r.created_at,
        updated_at: r.updated_at,
      },
      update: {
        name: r.name,
        short_name: r.short_name,
        jurisdiction: r.jurisdiction,
        authority: r.authority,
        effective_date: r.effective_date,
        description: r.description,
        status: r.status,
        terminology: r.terminology ?? undefined,
        legal_basis_options: r.legal_basis_options ?? undefined,
        country_codes: r.country_codes ?? undefined,
        changelog: r.changelog,
        is_active: r.is_active,
        updated_at: r.updated_at,
      },
    });
    regCount++;
  }
  console.log(`[seed-regulations] core_regulations: ${regCount} upserted`);

  // ── 2. Seed core_privacy_principles from privacy_principles ───────────────
  const principles = await prisma.$queryRaw<PrincipleRow[]>`
    SELECT * FROM privacy_principles ORDER BY sort_order
  `;
  console.log(`[seed-regulations] Found ${principles.length} principle(s) in legacy table`);

  let principleCount = 0;
  for (const p of principles) {
    await prisma.corePrivacyPrinciple.upsert({
      where: { code: p.code },
      create: {
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description,
        sort_order: p.sort_order,
      },
      update: {
        name: p.name,
        description: p.description,
        sort_order: p.sort_order,
      },
    });
    principleCount++;
  }
  console.log(`[seed-regulations] core_privacy_principles: ${principleCount} upserted`);

  // ── 3. Seed core_regulation_documents from regulation_documents ───────────
  const docs = await prisma.$queryRaw<DocRow[]>`
    SELECT * FROM regulation_documents WHERE deleted_at IS NULL ORDER BY created_at
  `;
  console.log(`[seed-regulations] Found ${docs.length} document(s) in legacy table`);

  let docCount = 0;
  for (const d of docs) {
    await prisma.coreRegulationDocument.upsert({
      where: { id: d.id },
      create: {
        id: d.id,
        regulation_id: d.regulation_id,
        title: d.title,
        doc_type: d.doc_type,
        source_type: d.source_type,
        file_ref: d.file_ref,
        external_url: d.external_url,
        issuing_authority: d.issuing_authority,
        version: d.version,
        effective_date: d.effective_date,
        description: d.description,
        file_size_bytes: d.file_size_bytes,
        page_count: d.page_count,
        is_visible: d.is_visible,
        sort_order: d.sort_order,
        created_by: d.created_by,
        created_at: d.created_at,
        updated_at: d.updated_at,
      },
      update: {
        title: d.title,
        doc_type: d.doc_type,
        source_type: d.source_type,
        file_ref: d.file_ref,
        external_url: d.external_url,
        issuing_authority: d.issuing_authority,
        version: d.version,
        effective_date: d.effective_date,
        description: d.description,
        file_size_bytes: d.file_size_bytes,
        page_count: d.page_count,
        is_visible: d.is_visible,
        sort_order: d.sort_order,
        updated_at: d.updated_at,
      },
    });
    docCount++;
  }
  console.log(`[seed-regulations] core_regulation_documents: ${docCount} upserted`);

  // ── 4. Seed core_tenant_regulation_toggles from tenant_regulation_toggles ──
  const toggles = await prisma.$queryRaw<ToggleRow[]>`
    SELECT * FROM tenant_regulation_toggles ORDER BY updated_at
  `;
  console.log(`[seed-regulations] Found ${toggles.length} toggle(s) in legacy table`);

  let toggleCount = 0;
  for (const t of toggles) {
    await prisma.coreTenantRegulationToggle.upsert({
      where: { tenant_id_regulation_id: { tenant_id: t.tenant_id, regulation_id: t.regulation_id } },
      create: {
        id: t.id,
        tenant_id: t.tenant_id,
        regulation_id: t.regulation_id,
        is_enabled: t.is_enabled,
        jurisdiction_detail: t.jurisdiction_detail,
        updated_by: t.updated_by,
        updated_at: t.updated_at,
      },
      update: {
        is_enabled: t.is_enabled,
        jurisdiction_detail: t.jurisdiction_detail,
        updated_by: t.updated_by,
        updated_at: t.updated_at,
      },
    });
    toggleCount++;
  }
  console.log(`[seed-regulations] core_tenant_regulation_toggles: ${toggleCount} upserted`);

  console.log('[seed-regulations] Done.');
}

main()
  .catch((err) => {
    console.error('[seed-regulations] Error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
