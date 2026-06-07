// Session A: ID-preserving population of core_regulations from privacy_regulations.
// Reads the 3 rows from privacy_regulations and INSERTs each into core_regulations using the
// SAME id value — so all child-table FKs referencing privacy_regulations.id remain valid
// against core_regulations.id after the FK constraint is moved in Session C.
//
// Uses ON CONFLICT (id) DO NOTHING — safe to re-run.
// Does NOT populate core_tenant_regulation_toggles.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../server/src/generated/prisma-client/index.js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

if (!process.env.DATABASE_URL) {
  console.error('[populate-core-regulations] DATABASE_URL is not set.');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

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

async function main() {
  console.log('[populate-core-regulations] Starting...');

  const regs = await prisma.$queryRaw<RegRow[]>`
    SELECT * FROM privacy_regulations ORDER BY code
  `;
  console.log(`[populate-core-regulations] Found ${regs.length} row(s) in privacy_regulations`);

  let inserted = 0;
  let skipped = 0;

  for (const r of regs) {
    const terminologyJson = r.terminology ? JSON.stringify(r.terminology) : null;
    const lboJson        = r.legal_basis_options ? JSON.stringify(r.legal_basis_options) : null;
    const ccJson         = r.country_codes ? JSON.stringify(r.country_codes) : null;

    const result = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO core_regulations (
        id, code, name, short_name, jurisdiction, authority, effective_date,
        description, status, terminology, legal_basis_options, country_codes,
        changelog, is_active, created_at, updated_at
      ) VALUES (
        ${r.id}::uuid, ${r.code}, ${r.name}, ${r.short_name ?? null},
        ${r.jurisdiction}, ${r.authority ?? null},
        ${r.effective_date ?? null},
        ${r.description ?? null}, ${r.status},
        ${terminologyJson}::jsonb, ${lboJson}::jsonb, ${ccJson}::jsonb,
        ${r.changelog ?? null}, ${r.is_active},
        ${r.created_at}, ${r.updated_at}
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id
    `;

    if (result.length > 0) {
      console.log(`  [INSERT] code=${r.code}  id=${r.id}`);
      inserted++;
    } else {
      console.log(`  [SKIP]   code=${r.code}  id=${r.id}  (already exists)`);
      skipped++;
    }
  }

  console.log(`[populate-core-regulations] Done — inserted: ${inserted}, skipped: ${skipped}`);

  // Verification: confirm IDs match exactly
  const coreRows = await prisma.$queryRaw<{ id: string; code: string }[]>`
    SELECT id, code FROM core_regulations ORDER BY code
  `;
  const privacyRows = await prisma.$queryRaw<{ id: string; code: string }[]>`
    SELECT id, code FROM privacy_regulations ORDER BY code
  `;

  console.log('\n[populate-core-regulations] Verification:');
  console.log('  core_regulations:    ', JSON.stringify(coreRows));
  console.log('  privacy_regulations: ', JSON.stringify(privacyRows));

  const allMatch = coreRows.every((c, i) => c.id === privacyRows[i]?.id && c.code === privacyRows[i]?.code);
  if (allMatch && coreRows.length === privacyRows.length) {
    console.log('  ✓ All IDs match exactly.');
  } else {
    console.error('  ✗ ID MISMATCH — review output above before proceeding.');
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error('[populate-core-regulations] Error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
