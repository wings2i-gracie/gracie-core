// Regulation service — owns core_regulations (Session C: write bridge removed; privacy_regulations retired app-side).
// privacy_compliance_requirements table reads via $queryRaw (not moved).
import prisma from '../../lib/prisma.js';

// ── Types ────────────────────────────────────────────────────────────────────

// Mirrors Privacy's RegulationSummary shape for structural compatibility in shims.
export interface CoreRegulationSummary {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
  jurisdiction: string;
  authority: string | null;
  effectiveDate: string | null;
  description: string | null;
  status: string;
  terminology: Record<string, string> | null;
  legalBasisOptions: Array<{ key: string; label: string; description: string }> | null;
  countryCodes: string[] | null;
  changelog: string | null;
  isActive: boolean;
  ownerScope: string;
  tenantId: string | null;
  requirementCount: number;
  docCount: number;
  tenantCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CoreRegulationWithToggle {
  id: string;
  code: string;
  name: string;
  shortName: string | null;
  jurisdiction: string;
  authority: string | null;
  effectiveDate: string | null;
  description: string | null;
  status: string;
  terminology: Record<string, string> | null;
  legalBasisOptions: unknown | null;
  countryCodes: string[] | null;
  changelog: string | null;
  isActive: boolean;
  ownerScope: string;
  tenantId: string | null;
  createdAt: string;
  updatedAt: string;
  isEnabled: boolean;
  jurisdictionDetail: string | null;
}

// ── Mappers ──────────────────────────────────────────────────────────────────

function mapRegulation(r: Record<string, unknown>): CoreRegulationSummary {
  return {
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    shortName: (r.short_name as string | null) ?? null,
    jurisdiction: r.jurisdiction as string,
    authority: (r.authority as string | null) ?? null,
    effectiveDate: r.effective_date
      ? new Date(r.effective_date as string).toISOString().split('T')[0]
      : null,
    description: (r.description as string | null) ?? null,
    status: (r.status as string) ?? 'published',
    terminology: (r.terminology as Record<string, string> | null) ?? null,
    legalBasisOptions:
      (r.legal_basis_options as Array<{ key: string; label: string; description: string }> | null) ??
      null,
    countryCodes: (r.country_codes as string[] | null) ?? null,
    changelog: (r.changelog as string | null) ?? null,
    isActive: Boolean(r.is_active),
    ownerScope: (r.owner_scope as string) ?? 'GLOBAL',
    tenantId: (r.tenant_id as string | null) ?? null,
    requirementCount: Number(r.requirement_count ?? 0),
    docCount: Number(r.doc_count ?? 0),
    tenantCount: Number(r.tenant_count ?? 0),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function mapDocument(d: {
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
  deleted_at: Date | null;
}) {
  return {
    id: d.id,
    regulationId: d.regulation_id,
    title: d.title,
    docType: d.doc_type,
    sourceType: d.source_type,
    fileRef: d.file_ref,
    externalUrl: d.external_url,
    issuingAuthority: d.issuing_authority,
    version: d.version,
    effectiveDate: d.effective_date
      ? new Date(d.effective_date).toISOString().split('T')[0]
      : null,
    description: d.description,
    fileSizeBytes: d.file_size_bytes,
    pageCount: d.page_count,
    isVisible: d.is_visible,
    sortOrder: d.sort_order,
    createdBy: d.created_by,
    creatorName: null as null,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
  };
}

// ── Scope helpers ─────────────────────────────────────────────────────────────

// Builds the tenant-facing visibility predicate: GLOBAL rows are always visible;
// TENANT-scoped rows are visible only to the authoring tenant.
function scopePredicateForTenant(tenantId: string) {
  return {
    OR: [
      { owner_scope: 'GLOBAL' },
      { owner_scope: 'TENANT', tenant_id: tenantId },
    ],
  };
}

// ── Read path ────────────────────────────────────────────────────────────────

// Super-admin Library default view: GLOBAL rows only.
// TENANT-scoped rows are NOT shown here; super-admins access them via support-mode
// (which impersonates a tenant and routes through listRegulationsWithToggles).
export async function listRegulations(): Promise<CoreRegulationSummary[]> {
  const regs = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT r.*,
      COUNT(DISTINCT cr.id) FILTER (WHERE cr.deleted_at IS NULL AND cr.tenant_id IS NULL) AS requirement_count,
      COUNT(DISTINCT rd.id) FILTER (WHERE rd.deleted_at IS NULL AND rd.is_visible = true) AS doc_count,
      COUNT(DISTINCT trt.tenant_id) FILTER (WHERE trt.is_enabled = true) AS tenant_count
    FROM core_regulations r
    LEFT JOIN privacy_compliance_requirements cr ON cr.regulation_code = r.code
    LEFT JOIN core_regulation_documents rd ON rd.regulation_id = r.id
    LEFT JOIN core_tenant_regulation_toggles trt ON trt.regulation_id = r.id
    WHERE r.owner_scope = 'GLOBAL'
    GROUP BY r.id
    ORDER BY r.name
  `;
  return regs.map(mapRegulation);
}

export async function getRegulation(id: string): Promise<CoreRegulationSummary> {
  const regs = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT r.*,
      COUNT(DISTINCT cr.id) FILTER (WHERE cr.deleted_at IS NULL AND cr.tenant_id IS NULL) AS requirement_count,
      COUNT(DISTINCT rd.id) FILTER (WHERE rd.deleted_at IS NULL) AS doc_count,
      COUNT(DISTINCT trt.tenant_id) FILTER (WHERE trt.is_enabled = true) AS tenant_count
    FROM core_regulations r
    LEFT JOIN privacy_compliance_requirements cr ON cr.regulation_code = r.code
    LEFT JOIN core_regulation_documents rd ON rd.regulation_id = r.id
    LEFT JOIN core_tenant_regulation_toggles trt ON trt.regulation_id = r.id
    WHERE r.id = ${id}::uuid
    GROUP BY r.id
  `;
  if (!regs[0])
    throw Object.assign(new Error('Regulation not found'), { statusCode: 404, code: 'NOT_FOUND' });
  return mapRegulation(regs[0]);
}

// privacy_compliance_requirements is an existing Privacy table — NOT moved in E2.8a.
export async function listRequirements(regulationId: string): Promise<unknown[]> {
  const regs = await prisma.$queryRaw<{ code: string }[]>`
    SELECT code FROM core_regulations WHERE id = ${regulationId}::uuid
  `;
  if (!regs[0])
    throw Object.assign(new Error('Regulation not found'), { statusCode: 404, code: 'NOT_FOUND' });
  const regCode = regs[0].code;

  return prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT cr.*, pp.code AS principle_code, pp.name AS principle_name
    FROM privacy_compliance_requirements cr
    LEFT JOIN core_privacy_principles pp ON pp.id = cr.principle_id
    WHERE cr.regulation_code = ${regCode}
      AND cr.tenant_id IS NULL
      AND cr.deleted_at IS NULL
    ORDER BY cr.sort_order, cr.article_ref
  `;
}

export async function listPrinciples(): Promise<unknown[]> {
  return prisma.corePrivacyPrinciple.findMany({ orderBy: { sort_order: 'asc' } });
}

export async function listDocuments(regulationId: string, saView = false): Promise<unknown[]> {
  const docs = await prisma.coreRegulationDocument.findMany({
    where: {
      regulation_id: regulationId,
      deleted_at: null,
      ...(saView ? {} : { is_visible: true }),
    },
    orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
  });
  return docs.map(mapDocument);
}

// ── Tenant toggles ───────────────────────────────────────────────────────────

export async function getEnabledRegulationsForTenant(tenantId: string): Promise<unknown[]> {
  const toggles = await prisma.coreTenantRegulationToggle.findMany({
    where: { tenant_id: tenantId, is_enabled: true },
    include: { regulation: true },
  });
  return toggles.map((t) => t.regulation);
}

export async function listRegulationsWithToggles(
  tenantId: string,
  updatedBy?: string,
): Promise<CoreRegulationWithToggle[]> {
  const [regs, toggles] = await Promise.all([
    prisma.coreRegulation.findMany({
      where: {
        AND: [
          { OR: [{ status: 'published' }, { is_active: true }] },
          scopePredicateForTenant(tenantId),
        ],
      },
      orderBy: { name: 'asc' },
    }),
    prisma.coreTenantRegulationToggle.findMany({ where: { tenant_id: tenantId } }),
  ]);

  const toggleMap = new Map(
    toggles.map((t) => [t.regulation_id, { isEnabled: t.is_enabled, jurisdictionDetail: t.jurisdiction_detail }]),
  );

  // Backfill missing toggle rows (fire-and-forget)
  if (updatedBy) {
    const missing = regs.filter((r) => !toggleMap.has(r.id));
    if (missing.length > 0) {
      prisma.coreTenantRegulationToggle
        .createMany({
          data: missing.map((r) => ({
            tenant_id: tenantId,
            regulation_id: r.id,
            is_enabled: false,
            updated_by: updatedBy,
          })),
          skipDuplicates: true,
        })
        .catch(() => {});
    }
  }

  return regs.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    shortName: r.short_name ?? null,
    jurisdiction: r.jurisdiction,
    authority: r.authority ?? null,
    effectiveDate: r.effective_date ? new Date(r.effective_date).toISOString().split('T')[0] : null,
    description: r.description ?? null,
    status: r.status,
    terminology: r.terminology as Record<string, string> | null,
    legalBasisOptions: r.legal_basis_options,
    countryCodes: r.country_codes as string[] | null,
    changelog: r.changelog ?? null,
    isActive: r.is_active,
    ownerScope: r.owner_scope,
    tenantId: r.tenant_id ?? null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    isEnabled: toggleMap.get(r.id)?.isEnabled ?? false,
    jurisdictionDetail: toggleMap.get(r.id)?.jurisdictionDetail ?? null,
  }));
}

// ── Write path ───────────────────────────────────────────────────────────────

export async function createRegulation(data: {
  code: string;
  name: string;
  shortName?: string;
  jurisdiction?: string;
  authority?: string;
  effectiveDate?: string;
  description?: string;
  terminology?: Record<string, string>;
  legalBasisOptions?: Array<{ key: string; label: string; description: string }>;
  countryCodes?: string[];
}) {
  if (!data.code || !data.name) {
    throw Object.assign(new Error('code and name are required'), { statusCode: 400, code: 'VALIDATION_ERROR' });
  }
  const code = data.code.toUpperCase();
  const existing = await prisma.coreRegulation.findUnique({ where: { code } });
  if (existing) {
    throw Object.assign(new Error(`Regulation code ${code} already exists`), { statusCode: 409, code: 'DUPLICATE_CODE' });
  }

  const terminologyJson = data.terminology ? JSON.stringify(data.terminology) : null;
  const lboJson = data.legalBasisOptions ? JSON.stringify(data.legalBasisOptions) : null;
  const ccJson = data.countryCodes ? JSON.stringify(data.countryCodes) : null;

  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    INSERT INTO core_regulations (
      code, name, short_name, jurisdiction, authority, effective_date,
      description, status, terminology, legal_basis_options, country_codes,
      is_active, created_at, updated_at
    ) VALUES (
      ${code}, ${data.name}, ${data.shortName ?? null},
      ${data.jurisdiction ?? ''}, ${data.authority ?? null},
      ${data.effectiveDate ? new Date(data.effectiveDate) : null},
      ${data.description ?? null}, 'draft',
      ${terminologyJson}::jsonb, ${lboJson}::jsonb, ${ccJson}::jsonb,
      false, now(), now()
    ) RETURNING *
  `;

  return rows[0];
}

// Creates a tenant-private regulation framework (owner_scope='TENANT').
// tenantId MUST come from the authenticated request context — never from request body.
// Gated to org_admin / compliance_manager in the router.
export async function createTenantFramework(
  tenantId: string,
  data: {
    code: string;
    name: string;
    shortName?: string;
    jurisdiction?: string;
    authority?: string;
    effectiveDate?: string;
    description?: string;
    terminology?: Record<string, string>;
    legalBasisOptions?: Array<{ key: string; label: string; description: string }>;
    countryCodes?: string[];
  },
) {
  if (!data.code || !data.name) {
    throw Object.assign(new Error('code and name are required'), { statusCode: 400, code: 'VALIDATION_ERROR' });
  }
  const code = data.code.toUpperCase();

  // Uniqueness is per-tenant: two tenants may independently define a framework with the same code.
  const existing = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM core_regulations
    WHERE code = ${code} AND owner_scope = 'TENANT' AND tenant_id = ${tenantId}::uuid
    LIMIT 1
  `;
  if (existing.length > 0) {
    throw Object.assign(
      new Error(`Framework code ${code} already exists for this organisation`),
      { statusCode: 409, code: 'DUPLICATE_CODE' },
    );
  }

  const terminologyJson = data.terminology ? JSON.stringify(data.terminology) : null;
  const lboJson = data.legalBasisOptions ? JSON.stringify(data.legalBasisOptions) : null;
  const ccJson = data.countryCodes ? JSON.stringify(data.countryCodes) : null;

  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    INSERT INTO core_regulations (
      code, name, short_name, jurisdiction, authority, effective_date,
      description, status, terminology, legal_basis_options, country_codes,
      is_active, owner_scope, tenant_id, created_at, updated_at
    ) VALUES (
      ${code}, ${data.name}, ${data.shortName ?? null},
      ${data.jurisdiction ?? ''}, ${data.authority ?? null},
      ${data.effectiveDate ? new Date(data.effectiveDate) : null},
      ${data.description ?? null}, 'draft',
      ${terminologyJson}::jsonb, ${lboJson}::jsonb, ${ccJson}::jsonb,
      false, 'TENANT', ${tenantId}::uuid, now(), now()
    ) RETURNING *
  `;

  return rows[0];
}

export async function updateRegulation(id: string, data: Record<string, unknown>) {
  const reg = await prisma.coreRegulation.findUnique({ where: { id } });
  if (!reg) throw Object.assign(new Error('Regulation not found'), { statusCode: 404, code: 'NOT_FOUND' });

  const coreSets: string[] = ['updated_at = now()'];
  const coreVals: unknown[] = [id];
  let idx = 2;

  if (data.name !== undefined) { coreSets.push(`name = $${idx++}`); coreVals.push(data.name); }
  if (data.shortName !== undefined) { coreSets.push(`short_name = $${idx++}`); coreVals.push(data.shortName); }
  if (data.jurisdiction !== undefined) { coreSets.push(`jurisdiction = $${idx++}`); coreVals.push(data.jurisdiction); }
  if (data.authority !== undefined) { coreSets.push(`authority = $${idx++}`); coreVals.push(data.authority ?? null); }
  if ('effectiveDate' in data) { coreSets.push(`effective_date = $${idx++}`); coreVals.push(data.effectiveDate ? new Date(data.effectiveDate as string) : null); }
  if (data.description !== undefined) { coreSets.push(`description = $${idx++}`); coreVals.push(data.description); }
  if (data.status !== undefined) { coreSets.push(`status = $${idx++}`); coreVals.push(data.status); }
  if (data.changelog !== undefined) { coreSets.push(`changelog = $${idx++}`); coreVals.push(data.changelog); }
  if (data.terminology !== undefined) { coreSets.push(`terminology = $${idx++}::jsonb`); coreVals.push(JSON.stringify(data.terminology)); }
  if (data.legalBasisOptions !== undefined) { coreSets.push(`legal_basis_options = $${idx++}::jsonb`); coreVals.push(JSON.stringify(data.legalBasisOptions)); }
  if (data.countryCodes !== undefined) { coreSets.push(`country_codes = $${idx++}::jsonb`); coreVals.push(JSON.stringify(data.countryCodes)); }

  if (coreSets.length > 1) {
    await prisma.$executeRawUnsafe(
      `UPDATE core_regulations SET ${coreSets.join(', ')} WHERE id = $1::uuid`,
      ...coreVals,
    );
  }

  return prisma.coreRegulation.findUniqueOrThrow({ where: { id } });
}

export async function publishRegulation(id: string, changelog?: string) {
  const reg = await prisma.coreRegulation.findUnique({ where: { id } });
  if (!reg) throw Object.assign(new Error('Regulation not found'), { statusCode: 404, code: 'NOT_FOUND' });

  const changelogVal = changelog ?? null;
  await prisma.$executeRaw`
    UPDATE core_regulations
    SET status = 'published', is_active = true, changelog = ${changelogVal}, updated_at = now()
    WHERE id = ${id}::uuid
  `;
  return prisma.coreRegulation.findUniqueOrThrow({ where: { id } });
}

export async function deprecateRegulation(id: string) {
  const reg = await prisma.coreRegulation.findUnique({ where: { id } });
  if (!reg) throw Object.assign(new Error('Regulation not found'), { statusCode: 404, code: 'NOT_FOUND' });

  await prisma.$executeRaw`
    UPDATE core_regulations SET status = 'deprecated', is_active = false, updated_at = now()
    WHERE id = ${id}::uuid
  `;
  return prisma.coreRegulation.findUniqueOrThrow({ where: { id } });
}

export async function deleteRegulation(id: string): Promise<void> {
  const reg = await prisma.coreRegulation.findUnique({ where: { id } });
  if (!reg) throw Object.assign(new Error('Regulation not found'), { statusCode: 404, code: 'NOT_FOUND' });

  const inUse = await prisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT COUNT(*) AS cnt FROM core_tenant_regulation_toggles
    WHERE regulation_id = ${id}::uuid AND is_enabled = true
  `;
  if (Number(inUse[0]?.cnt ?? 0) > 0) {
    throw Object.assign(
      new Error('Regulation is enabled for one or more tenants — disable before deleting'),
      { statusCode: 400, code: 'REGULATION_IN_USE' },
    );
  }

  // Remove Core dependent rows then the regulation itself
  await prisma.$executeRaw`DELETE FROM core_tenant_regulation_toggles WHERE regulation_id = ${id}::uuid`;
  await prisma.$executeRaw`DELETE FROM core_regulation_documents WHERE regulation_id = ${id}::uuid`;
  await prisma.$executeRaw`DELETE FROM core_regulations WHERE id = ${id}::uuid`;

}

// ── Tenant-facing document reads (E2.8b) ─────────────────────────────────────

export async function listDocumentsForTenant(tenantId: string) {
  const toggles = await prisma.coreTenantRegulationToggle.findMany({
    where: { tenant_id: tenantId, is_enabled: true },
    select: { regulation_id: true },
  });
  if (toggles.length === 0) return [];

  const regulationIds = toggles.map((t) => t.regulation_id);
  const docs = await prisma.coreRegulationDocument.findMany({
    where: { regulation_id: { in: regulationIds }, deleted_at: null, is_visible: true },
    include: { regulation: { select: { code: true, name: true } } },
    orderBy: [{ regulation: { code: 'asc' } }, { sort_order: 'asc' }],
  });

  return docs.map((d) => ({
    ...mapDocument(d),
    regCode: d.regulation.code,
    regName: d.regulation.name,
  }));
}

export async function listDocumentsForRegulation(regulationId: string, tenantId: string) {
  const toggle = await prisma.coreTenantRegulationToggle.findFirst({
    where: { regulation_id: regulationId, tenant_id: tenantId, is_enabled: true },
  });
  if (!toggle) {
    throw Object.assign(new Error('Regulation not enabled for your organisation'), { statusCode: 403, code: 'FORBIDDEN' });
  }
  const docs = await prisma.coreRegulationDocument.findMany({
    where: { regulation_id: regulationId, deleted_at: null, is_visible: true },
    orderBy: { sort_order: 'asc' },
  });
  return docs.map(mapDocument);
}

export async function toggleRegulation(
  tenantId: string,
  regulationId: string,
  enabled: boolean,
  updatedBy: string,
): Promise<unknown> {
  const reg = await prisma.coreRegulation.findUnique({ where: { id: regulationId } });
  if (!reg)
    throw Object.assign(new Error('Regulation not found'), { code: 'NOT_FOUND', status: 404 });

  return prisma.coreTenantRegulationToggle.upsert({
    where: { tenant_id_regulation_id: { tenant_id: tenantId, regulation_id: regulationId } },
    create: { tenant_id: tenantId, regulation_id: regulationId, is_enabled: enabled, updated_by: updatedBy },
    update: { is_enabled: enabled, updated_by: updatedBy },
  });
}
