import jwt from 'jsonwebtoken';
import prisma from '../../lib/prisma.js';
import type { CoreLicenseTier, CoreTenantRecord, CoreTenantLicense, CoreSupportModeSession } from '@wings2i-gracie/contracts';

// ── List Tenants ──────────────────────────────────────────────────────────────

export interface ListTenantsFilter {
  page?: number;
  pageSize?: number;
  status?: 'active' | 'suspended' | 'archived' | 'trial' | 'all';
  search?: string;
}

export interface ListTenantsResult {
  tenants: (CoreTenantRecord & { userCount: number; licenseCount: number })[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listTenants(filters?: ListTenantsFilter): Promise<ListTenantsResult> {
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {};

  if (filters?.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { slug: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  if (!filters?.status || filters.status === 'all') {
    // no status filter
  } else if (filters.status === 'archived') {
    where.archived_at = { not: null };
  } else {
    where.archived_at = null;
    where.status = filters.status;
  }

  const [rows, total] = await Promise.all([
    prisma.coreTenant.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { created_at: 'desc' },
      include: {
        users: { where: { deleted_at: null }, select: { id: true } },
        licenses: { where: { deleted_at: null } },
      },
    }),
    prisma.coreTenant.count({ where }),
  ]);

  const tenants = rows.map((t) => {
    const primaryLicense = t.licenses.find((l) => l.product_key === 'privacy') ?? t.licenses[0];
    return {
      id: t.id,
      slug: t.slug,
      name: t.name,
      status: toEffectiveStatus(t),
      planTier: primaryLicense ? (primaryLicense.tier as CoreLicenseTier) : null,
      createdAt: t.created_at.toISOString(),
      suspendedAt: t.status === 'suspended' && !t.archived_at ? t.updated_at.toISOString() : null,
      archivedAt: t.archived_at ? t.archived_at.toISOString() : null,
      userCount: t.users.length,
      licenseCount: t.licenses.length,
    };
  });

  return { tenants, total, page, pageSize };
}

// ── Get Tenant ────────────────────────────────────────────────────────────────

export async function getTenant(tenantId: string): Promise<CoreTenantRecord & { userCount: number; licenses: CoreTenantLicense[] }> {
  const t = await prisma.coreTenant.findUniqueOrThrow({
    where: { id: tenantId },
    include: {
      users: { where: { deleted_at: null }, select: { id: true } },
      licenses: { where: { deleted_at: null }, orderBy: { created_at: 'asc' } },
    },
  });

  const primaryLicense = t.licenses.find((l) => l.product_key === 'privacy') ?? t.licenses[0];
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    status: toEffectiveStatus(t),
    planTier: primaryLicense ? (primaryLicense.tier as CoreLicenseTier) : null,
    createdAt: t.created_at.toISOString(),
    suspendedAt: t.status === 'suspended' && !t.archived_at ? t.updated_at.toISOString() : null,
    archivedAt: t.archived_at ? t.archived_at.toISOString() : null,
    userCount: t.users.length,
    licenses: t.licenses.map(mapLicense),
  };
}

// ── Create Tenant ─────────────────────────────────────────────────────────────

export async function createTenant(params: {
  name: string;
  slug: string;
  createdBy: string;
  initialLicenseProductKey?: string;
  initialLicenseTier?: CoreLicenseTier;
}): Promise<CoreTenantRecord> {
  const { name, slug, createdBy, initialLicenseProductKey = 'privacy', initialLicenseTier = 'core' } = params;

  const t = await prisma.$transaction(async (tx) => {
    const tenant = await tx.coreTenant.create({
      data: { name, slug, status: 'trial' },
    });

    await tx.coreTenantLicense.create({
      data: {
        tenant_id: tenant.id,
        product_key: initialLicenseProductKey,
        tier: initialLicenseTier,
        assigned_by: createdBy,
      },
    });

    return tenant;
  });

  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    status: 'trial',
    planTier: initialLicenseTier,
    createdAt: t.created_at.toISOString(),
    suspendedAt: null,
    archivedAt: null,
  };
}

// ── Suspend Tenant ────────────────────────────────────────────────────────────

export async function suspendTenant(tenantId: string): Promise<CoreTenantRecord> {
  const t = await prisma.coreTenant.update({
    where: { id: tenantId },
    data: { status: 'suspended' },
  });

  return toRecord(t, null);
}

// ── Reactivate Tenant ─────────────────────────────────────────────────────────

export async function reactivateTenant(tenantId: string): Promise<CoreTenantRecord> {
  const t = await prisma.coreTenant.update({
    where: { id: tenantId },
    data: { status: 'active', archived_at: null, archived_by: null },
  });

  return toRecord(t, null);
}

// ── Archive Tenant ────────────────────────────────────────────────────────────

export async function archiveTenant(tenantId: string, archivedBy: string): Promise<CoreTenantRecord> {
  const now = new Date();
  const t = await prisma.coreTenant.update({
    where: { id: tenantId },
    data: { status: 'suspended', archived_at: now, archived_by: archivedBy },
  });

  return toRecord(t, null);
}

// ── Assign License ────────────────────────────────────────────────────────────

export async function assignLicense(
  tenantId: string,
  productKey: string,
  tier: CoreLicenseTier,
  assignedBy: string,
  validUntil?: Date,
): Promise<CoreTenantLicense> {
  // Soft-delete any existing active license for this tenant+product
  await prisma.coreTenantLicense.updateMany({
    where: { tenant_id: tenantId, product_key: productKey, deleted_at: null },
    data: { deleted_at: new Date() },
  });

  const license = await prisma.coreTenantLicense.create({
    data: {
      tenant_id: tenantId,
      product_key: productKey,
      tier,
      assigned_by: assignedBy,
      valid_until: validUntil ?? null,
    },
  });

  return mapLicense(license);
}

// ── Revoke License ────────────────────────────────────────────────────────────

export async function revokeLicense(tenantId: string, productKey: string): Promise<void> {
  await prisma.coreTenantLicense.updateMany({
    where: { tenant_id: tenantId, product_key: productKey, deleted_at: null },
    data: { deleted_at: new Date(), valid_until: new Date() },
  });
}

// ── Get Licenses ──────────────────────────────────────────────────────────────

export async function getLicenses(tenantId: string): Promise<CoreTenantLicense[]> {
  const rows = await prisma.coreTenantLicense.findMany({
    where: { tenant_id: tenantId, deleted_at: null },
    orderBy: { created_at: 'asc' },
  });

  return rows.map(mapLicense);
}

// ── Issue Support Mode Token ──────────────────────────────────────────────────

export interface SupportModeResult {
  token: string;
  sessionId: string;
  tenantName: string;
  expiresAt: string;
  session: CoreSupportModeSession;
}

export async function issueSupportModeToken(
  superAdminUserId: string,
  tenantId: string,
  auditNote?: string,
): Promise<SupportModeResult> {
  const [superAdmin, tenant] = await Promise.all([
    prisma.coreUser.findUniqueOrThrow({ where: { id: superAdminUserId } }),
    prisma.coreTenant.findUniqueOrThrow({ where: { id: tenantId } }),
  ]);

  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours

  const session = await prisma.coreSupportModeSession.create({
    data: {
      tenant_id: tenantId,
      super_admin_user_id: superAdminUserId,
      expires_at: expiresAt,
      audit_note: auditNote ?? null,
    },
  });

  const secret = process.env.CORE_JWT_SECRET ?? process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT secret not configured');

  const token = jwt.sign(
    {
      id: superAdmin.id,
      email: superAdmin.email,
      role: 'org_admin',
      tenantId: tenant.id,
      organisationId: null,
      functionId: null,
      locationId: null,
      organisationName: tenant.name,
      isSupportMode: true,
      originalRole: 'super_admin',
    },
    secret,
    { expiresIn: '2h' },
  );

  return {
    token,
    sessionId: session.id,
    tenantName: tenant.name,
    expiresAt: expiresAt.toISOString(),
    session: mapSession(session),
  };
}

// ── Exit Support Mode ─────────────────────────────────────────────────────────

export async function exitSupportMode(sessionId: string): Promise<CoreSupportModeSession> {
  const session = await prisma.coreSupportModeSession.update({
    where: { id: sessionId },
    data: { exited_at: new Date() },
  });

  return mapSession(session);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toEffectiveStatus(t: { status: string; archived_at: Date | null }): CoreTenantRecord['status'] {
  if (t.archived_at) return 'archived';
  return t.status as CoreTenantRecord['status'];
}

function toRecord(
  t: { id: string; slug: string; name: string; status: string; archived_at: Date | null; created_at: Date; updated_at: Date; archived_by: string | null },
  planTier: CoreLicenseTier | null,
): CoreTenantRecord {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    status: toEffectiveStatus(t),
    planTier,
    createdAt: t.created_at.toISOString(),
    suspendedAt: t.status === 'suspended' && !t.archived_at ? t.updated_at.toISOString() : null,
    archivedAt: t.archived_at ? t.archived_at.toISOString() : null,
  };
}

function mapLicense(l: {
  id: string;
  tenant_id: string;
  product_key: string;
  tier: string;
  valid_from: Date;
  valid_until: Date | null;
  assigned_by: string;
  created_at: Date;
}): CoreTenantLicense {
  return {
    id: l.id,
    tenantId: l.tenant_id,
    productKey: l.product_key,
    tier: l.tier as CoreLicenseTier,
    validFrom: l.valid_from.toISOString(),
    validUntil: l.valid_until ? l.valid_until.toISOString() : null,
    assignedBy: l.assigned_by,
    createdAt: l.created_at.toISOString(),
  };
}

function mapSession(s: {
  id: string;
  tenant_id: string;
  super_admin_user_id: string;
  issued_at: Date;
  expires_at: Date;
  exited_at: Date | null;
  audit_note: string | null;
}): CoreSupportModeSession {
  return {
    id: s.id,
    tenantId: s.tenant_id,
    superAdminUserId: s.super_admin_user_id,
    issuedAt: s.issued_at.toISOString(),
    expiresAt: s.expires_at.toISOString(),
    exitedAt: s.exited_at ? s.exited_at.toISOString() : null,
    auditNote: s.audit_note,
  };
}
