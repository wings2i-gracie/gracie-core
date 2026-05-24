// E2.8a: Regulation Library read path + tenant toggles extracted to gracie-core.
// Write path (createRegulation, updateRequirement, etc.) remains in Privacy — E2.8b.
// compliance_requirements table is NOT moved in this session — reads via $queryRaw.
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

// ── Read path ────────────────────────────────────────────────────────────────

export async function listRegulations(): Promise<CoreRegulationSummary[]> {
  const regs = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT r.*,
      COUNT(DISTINCT cr.id) FILTER (WHERE cr.deleted_at IS NULL AND cr.tenant_id IS NULL) AS requirement_count,
      COUNT(DISTINCT rd.id) FILTER (WHERE rd.deleted_at IS NULL AND rd.is_visible = true) AS doc_count,
      COUNT(DISTINCT trt.tenant_id) FILTER (WHERE trt.is_enabled = true) AS tenant_count
    FROM core_regulations r
    LEFT JOIN compliance_requirements cr ON cr.regulation_code = r.code
    LEFT JOIN core_regulation_documents rd ON rd.regulation_id = r.id
    LEFT JOIN core_tenant_regulation_toggles trt ON trt.regulation_id = r.id
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
    LEFT JOIN compliance_requirements cr ON cr.regulation_code = r.code
    LEFT JOIN core_regulation_documents rd ON rd.regulation_id = r.id
    LEFT JOIN core_tenant_regulation_toggles trt ON trt.regulation_id = r.id
    WHERE r.id = ${id}::uuid
    GROUP BY r.id
  `;
  if (!regs[0])
    throw Object.assign(new Error('Regulation not found'), { statusCode: 404, code: 'NOT_FOUND' });
  return mapRegulation(regs[0]);
}

// compliance_requirements is an existing Privacy table — NOT moved in E2.8a.
export async function listRequirements(regulationId: string): Promise<unknown[]> {
  const regs = await prisma.$queryRaw<{ code: string }[]>`
    SELECT code FROM core_regulations WHERE id = ${regulationId}::uuid
  `;
  if (!regs[0])
    throw Object.assign(new Error('Regulation not found'), { statusCode: 404, code: 'NOT_FOUND' });
  const regCode = regs[0].code;

  return prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT cr.*, pp.code AS principle_code, pp.name AS principle_name
    FROM compliance_requirements cr
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
      where: { OR: [{ status: 'published' }, { is_active: true }] },
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
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    isEnabled: toggleMap.get(r.id)?.isEnabled ?? false,
    jurisdictionDetail: toggleMap.get(r.id)?.jurisdictionDetail ?? null,
  }));
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
