// E2.5: Org Context functions extracted from Privacy organisation.service.ts.
// Uses gracie-core's Prisma client (CoreOrgProfile, CoreFunction, etc.)
// which @@map to existing Privacy PostgreSQL tables (no migrations for those tables).
import prisma from '../../lib/prisma.js';

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapOrg(o: {
  id: string; tenant_id: string; name: string; website: string | null;
  address: string | null; contact_email: string | null; contact_phone: string | null;
  // Batch B (#5): industry_sector is now a Postgres text[] (NOT NULL DEFAULT '{}').
  industry_sector: string[]; employee_band: string | null;
  is_sdf: boolean; is_consent_manager: boolean; created_by: string | null;
  created_at: Date; updated_at: Date; deleted_at: Date | null;
}) {
  return {
    id: o.id, tenantId: o.tenant_id, name: o.name, website: o.website,
    address: o.address, contactEmail: o.contact_email, contactPhone: o.contact_phone,
    industrySector: o.industry_sector, employeeBand: o.employee_band,
    isSdf: o.is_sdf, isConsentManager: o.is_consent_manager,
    createdBy: o.created_by, createdAt: o.created_at.toISOString(),
    updatedAt: o.updated_at.toISOString(), deletedAt: o.deleted_at?.toISOString() ?? null,
  };
}

function mapFunction(f: {
  id: string; tenant_id: string; organisation_id: string; name: string;
  description: string | null; head_user_id: string | null; created_by: string | null;
  created_at: Date; updated_at: Date; deleted_at: Date | null; status: string;
  head_user?: { first_name: string; last_name: string } | null;
}) {
  return {
    id: f.id, tenantId: f.tenant_id, organisationId: f.organisation_id,
    name: f.name, description: f.description, headUserId: f.head_user_id,
    headUserName: f.head_user ? `${f.head_user.first_name} ${f.head_user.last_name}` : null,
    createdBy: f.created_by, createdAt: f.created_at.toISOString(),
    updatedAt: f.updated_at.toISOString(), deletedAt: f.deleted_at?.toISOString() ?? null,
    status: f.status,
    // S-STATUS-MODEL: active state now derives from status, not deleted_at
    // (deactivated functions keep deleted_at NULL).
    isActive: f.status === 'active',
  };
}

function mapLocation(l: {
  id: string; tenant_id: string; organisation_id: string; name: string; country_code: string;
  region: string | null; is_data_subject_location: boolean; is_processing_location: boolean;
  is_active: boolean; created_by: string | null; created_at: Date; updated_at: Date;
  deleted_at: Date | null; status: string;
}) {
  return {
    id: l.id, tenantId: l.tenant_id, organisationId: l.organisation_id,
    name: l.name, countryCode: l.country_code, region: l.region,
    isDataSubjectLocation: l.is_data_subject_location,
    isProcessingLocation: l.is_processing_location,
    status: l.status,
    // S-STATUS-MODEL: active state derives from status (is_active kept in sync).
    isActive: l.status === 'active', createdBy: l.created_by,
    createdAt: l.created_at.toISOString(), updatedAt: l.updated_at.toISOString(),
    deletedAt: l.deleted_at?.toISOString() ?? null,
  };
}

function mapEntity(e: {
  id: string; tenant_id: string; organisation_id: string; name: string;
  legal_name: string; country_code: string; is_primary: boolean;
  created_by: string | null; created_at: Date; updated_at: Date; deleted_at: Date | null;
}) {
  return {
    id: e.id, tenantId: e.tenant_id, organisationId: e.organisation_id,
    name: e.name, legalName: e.legal_name, countryCode: e.country_code,
    isPrimary: e.is_primary, createdBy: e.created_by,
    createdAt: e.created_at.toISOString(), updatedAt: e.updated_at.toISOString(),
    deletedAt: e.deleted_at?.toISOString() ?? null,
  };
}

function mapStakeholder(s: {
  id: string; tenant_id: string; organisation_id: string; name: string;
  role_title: string; email: string | null; phone: string | null;
  stakeholder_type: string; stakeholder_type_other: string | null;
  function_id: string | null; function_label: string | null;
  created_by: string | null; created_at: Date; updated_at: Date; deleted_at: Date | null;
}) {
  return {
    id: s.id, tenantId: s.tenant_id, organisationId: s.organisation_id,
    name: s.name, roleTitle: s.role_title, email: s.email, phone: s.phone,
    stakeholderType: s.stakeholder_type, stakeholderTypeOther: s.stakeholder_type_other,
    functionId: s.function_id, functionLabel: s.function_label,
    createdBy: s.created_by,
    createdAt: s.created_at.toISOString(), updatedAt: s.updated_at.toISOString(),
    deletedAt: s.deleted_at?.toISOString() ?? null,
  };
}

// ── Org profile ───────────────────────────────────────────────────────────────

export async function getOrgProfile(tenantId: string) {
  const org = await prisma.coreOrgProfile.findFirst({
    where: { tenant_id: tenantId, deleted_at: null },
  });
  return org ? mapOrg(org) : null;
}

export async function getOrCreateOrgProfile(tenantId: string): Promise<ReturnType<typeof mapOrg>> {
  const existing = await prisma.coreOrgProfile.findFirst({
    where: { tenant_id: tenantId, deleted_at: null },
  });
  if (existing) return mapOrg(existing);
  throw Object.assign(new Error('Organisation not found'), { code: 'ORG_NOT_FOUND', status: 404 });
}

export async function upsertOrgProfile(
  tenantId: string,
  createdBy: string,
  data: {
    name: string;
    website?: string | null;
    address?: string | null;
    contactEmail?: string | null;
    contactPhone?: string | null;
    // Batch B (#5): multi-select industry sectors stored as text[].
    industrySector?: string[];
    employeeBand?: string | null;
    isSdf?: boolean;
    isConsentManager?: boolean;
  },
) {
  const existing = await prisma.coreOrgProfile.findFirst({
    where: { tenant_id: tenantId, deleted_at: null },
  });

  let org;
  if (existing) {
    org = await prisma.coreOrgProfile.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        website: data.website !== undefined ? data.website : existing.website,
        address: data.address !== undefined ? data.address : existing.address,
        contact_email: data.contactEmail !== undefined ? data.contactEmail : existing.contact_email,
        contact_phone: data.contactPhone !== undefined ? data.contactPhone : existing.contact_phone,
        industry_sector: data.industrySector !== undefined ? data.industrySector : existing.industry_sector,
        employee_band: data.employeeBand !== undefined ? data.employeeBand : existing.employee_band,
        is_sdf: data.isSdf !== undefined ? data.isSdf : existing.is_sdf,
        is_consent_manager: data.isConsentManager !== undefined ? data.isConsentManager : existing.is_consent_manager,
      },
    });
  } else {
    org = await prisma.coreOrgProfile.create({
      data: {
        tenant_id: tenantId,
        name: data.name,
        website: data.website ?? null,
        address: data.address ?? null,
        contact_email: data.contactEmail ?? null,
        contact_phone: data.contactPhone ?? null,
        // Batch B (#5): text[] column — default to an empty array, never null.
        industry_sector: data.industrySector ?? [],
        employee_band: data.employeeBand ?? null,
        is_sdf: data.isSdf ?? false,
        is_consent_manager: data.isConsentManager ?? false,
        created_by: createdBy,
      },
    });
    // Update tenant users with this organisation_id (use raw to avoid cross-schema FK issues)
    await prisma.$executeRawUnsafe(
      `UPDATE core_users SET organisation_id = $1 WHERE tenant_id = $2 AND organisation_id IS NULL`,
      org.id, tenantId,
    );
  }

  return mapOrg(org);
}

// ── DPO details (backed by core_org_role_assignments with role_type_key='dpo') ──

export async function getDpoDetails(tenantId: string) {
  const assignment = await prisma.coreOrgRoleAssignment.findUnique({
    where: { tenant_id_role_type_key: { tenant_id: tenantId, role_type_key: 'dpo' } },
  });
  if (!assignment) return null;
  return {
    id: assignment.id,
    tenantId: assignment.tenant_id,
    name: assignment.name ?? '',
    email: assignment.email ?? '',
    phone: assignment.phone,
    roleTitle: assignment.role_title,
    appointmentDate: assignment.appointment_date?.toISOString().split('T')[0] ?? null,
    createdBy: assignment.created_by,
    createdAt: assignment.created_at.toISOString(),
    updatedAt: assignment.updated_at.toISOString(),
  };
}

export async function upsertDpoDetails(
  tenantId: string,
  createdBy: string,
  data: { name: string; email: string; phone?: string | null; roleTitle?: string | null; appointmentDate?: string | null },
) {
  const assignment = await prisma.coreOrgRoleAssignment.upsert({
    where: { tenant_id_role_type_key: { tenant_id: tenantId, role_type_key: 'dpo' } },
    create: {
      tenant_id: tenantId,
      role_type_key: 'dpo',
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      role_title: data.roleTitle ?? null,
      appointment_date: data.appointmentDate ? new Date(data.appointmentDate) : null,
      created_by: createdBy,
    },
    update: {
      name: data.name,
      email: data.email,
      phone: data.phone !== undefined ? data.phone : undefined,
      role_title: data.roleTitle !== undefined ? data.roleTitle : undefined,
      appointment_date: data.appointmentDate !== undefined
        ? (data.appointmentDate ? new Date(data.appointmentDate) : null)
        : undefined,
    },
  });
  return {
    id: assignment.id,
    tenantId: assignment.tenant_id,
    name: assignment.name ?? '',
    email: assignment.email ?? '',
    phone: assignment.phone,
    roleTitle: assignment.role_title,
    appointmentDate: assignment.appointment_date?.toISOString().split('T')[0] ?? null,
    createdBy: assignment.created_by,
    createdAt: assignment.created_at.toISOString(),
    updatedAt: assignment.updated_at.toISOString(),
  };
}

// ── Functions ─────────────────────────────────────────────────────────────────

export async function listFunctions(tenantId: string, includeInactive = false) {
  // S-STATUS-MODEL: filter on status, never deleted_at. includeInactive=false →
  // active only; includeInactive=true → active + deactivated (never 'removed').
  const fns = await prisma.coreFunction.findMany({
    where: {
      tenant_id: tenantId,
      status: includeInactive ? { in: ['active', 'deactivated'] } : 'active',
    },
    include: { head_user: { select: { first_name: true, last_name: true } } },
    orderBy: { name: 'asc' },
  });
  return fns.map(mapFunction);
}

export async function createFunction(
  tenantId: string,
  createdBy: string,
  data: { name: string; description?: string | null; headUserId?: string | null },
) {
  const org = await prisma.coreOrgProfile.findFirst({ where: { tenant_id: tenantId, deleted_at: null } });
  if (!org) throw Object.assign(new Error('Organisation not found — complete wizard first'), { code: 'ORG_NOT_FOUND', status: 400 });

  // Batch B (#6): app-level duplicate-name guard (no DB unique index yet). Exact
  // name match, case-insensitive, tenant-scoped, deleted_at IS NULL (blocks against
  // active + deactivated; a 'removed' function always carries deleted_at, so its name
  // is free to reuse).
  const dup = await prisma.coreFunction.findFirst({
    where: { tenant_id: tenantId, deleted_at: null, name: { equals: data.name.trim(), mode: 'insensitive' } },
  });
  if (dup) {
    throw Object.assign(new Error('A function with this name already exists'), { code: 'FUNCTION_NAME_DUPLICATE', status: 409 });
  }

  const fn = await prisma.coreFunction.create({
    data: {
      tenant_id: tenantId,
      organisation_id: org.id,
      name: data.name,
      description: data.description ?? null,
      head_user_id: data.headUserId ?? null,
      created_by: createdBy,
    },
    include: { head_user: { select: { first_name: true, last_name: true } } },
  });
  return mapFunction(fn);
}

export async function updateFunction(
  tenantId: string,
  functionId: string,
  data: { name?: string; description?: string | null; headUserId?: string | null },
) {
  const existing = await prisma.coreFunction.findFirst({
    where: { id: functionId, tenant_id: tenantId, deleted_at: null },
  });
  if (!existing) throw Object.assign(new Error('Function not found'), { code: 'NOT_FOUND', status: 404 });

  // Batch B (#6): duplicate-name guard on rename — only when a (changed) name is
  // provided. Excludes self; same tenant-scoped, case-insensitive, deleted_at IS NULL
  // predicate as createFunction.
  if (data.name !== undefined && data.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
    const dup = await prisma.coreFunction.findFirst({
      where: {
        tenant_id: tenantId, deleted_at: null, id: { not: functionId },
        name: { equals: data.name.trim(), mode: 'insensitive' },
      },
    });
    if (dup) {
      throw Object.assign(new Error('A function with this name already exists'), { code: 'FUNCTION_NAME_DUPLICATE', status: 409 });
    }
  }

  const fn = await prisma.coreFunction.update({
    where: { id: functionId },
    data: {
      name: data.name ?? existing.name,
      description: data.description !== undefined ? data.description : existing.description,
      head_user_id: data.headUserId !== undefined ? data.headUserId : existing.head_user_id,
    },
    include: { head_user: { select: { first_name: true, last_name: true } } },
  });
  return mapFunction(fn);
}

export async function deactivateFunction(tenantId: string, functionId: string) {
  // S-STATUS-MODEL: only an active function can be deactivated.
  const existing = await prisma.coreFunction.findFirst({
    where: { id: functionId, tenant_id: tenantId, status: 'active' },
  });
  if (!existing) throw Object.assign(new Error('Function not found'), { code: 'NOT_FOUND', status: 404 });

  // 5B: core_users.function_id dropped — "assigned to this function" now means
  // holding an active grant. Re-expressed onto core_user_function_grants, keeping the
  // original active-user-only semantics (grant rows carry plain UUIDs, no relation).
  const grantedUserIds = (await prisma.coreUserFunctionGrant.findMany({
    where: { tenant_id: tenantId, function_id: functionId, deleted_at: null },
    select: { user_id: true },
  })).map((g) => g.user_id);

  const assignedUsers = grantedUserIds.length
    ? await prisma.coreUser.count({
        where: { id: { in: grantedUserIds }, tenant_id: tenantId, is_active: true, deleted_at: null },
      })
    : 0;
  if (assignedUsers > 0) {
    throw Object.assign(
      new Error(`Cannot deactivate — ${assignedUsers} active user(s) are assigned to this function`),
      { code: 'FUNCTION_IN_USE', status: 409 },
    );
  }

  // S-STATUS-MODEL: deactivate marks status only — deleted_at stays NULL (reversible,
  // not on the purge clock).
  await prisma.coreFunction.update({
    where: { id: functionId },
    data: { status: 'deactivated' },
  });
}

// S-REACTIVATE: reverse of deactivateFunction — restore a deactivated function to
// active. Only a status='deactivated' row (which by invariant has deleted_at NULL)
// is eligible; an 'active' row is a no-op and a 'removed' row (deleted_at set) is out
// of scope — both raise a typed 409. deleted_at is never touched.
export async function reactivateFunction(tenantId: string, functionId: string) {
  const existing = await prisma.coreFunction.findFirst({
    where: { id: functionId, tenant_id: tenantId, status: 'deactivated', deleted_at: null },
  });
  if (!existing) {
    throw Object.assign(
      new Error('Function cannot be reactivated — it is not in a deactivated state'),
      { code: 'FUNCTION_NOT_DEACTIVATED', status: 409 },
    );
  }
  await prisma.coreFunction.update({
    where: { id: functionId },
    data: { status: 'active' },
  });
}

// Permanent Remove (soft-delete + grant cleanup), gated by a six-table dependency
// check. Distinct from deactivateFunction (reversible). Blocks when ANY active
// reference exists in the six dependency tables; on success soft-deletes the
// function and hard-deletes its (FK-less) user-function grants so they cannot
// dangle. core_user_function_grants is modelled in the Core Prisma client; the
// five privacy_* tables are NOT — they live in the same database but outside the
// Core schema, so they are counted via parameterised raw SQL (function id is
// always a bound parameter, never interpolated).
export async function removeFunction(tenantId: string, functionId: string): Promise<void> {
  // S-STATUS-MODEL: only an active function can be removed.
  const existing = await prisma.coreFunction.findFirst({
    where: { id: functionId, tenant_id: tenantId, status: 'active' },
  });
  if (!existing) throw Object.assign(new Error('Function not found'), { code: 'NOT_FOUND', status: 404 });

  // Grant check mirrors deactivateFunction: a grant blocks only when its user is
  // still an active user (active-user-faithful, two-query).
  const grantedUserIds = (await prisma.coreUserFunctionGrant.findMany({
    where: { tenant_id: tenantId, function_id: functionId, deleted_at: null },
    select: { user_id: true },
  })).map((g) => g.user_id);

  const [
    assignedUsers,
    piContextRows,
    taskRows,
    stakeholderRows,
    trainingRows,
    complianceRows,
  ] = await Promise.all([
    grantedUserIds.length
      ? prisma.coreUser.count({
          where: { id: { in: grantedUserIds }, tenant_id: tenantId, is_active: true, deleted_at: null },
        })
      : Promise.resolve(0),
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM privacy_pi_contexts
      WHERE function_id = ${functionId}::uuid AND deleted_at IS NULL`,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM privacy_tasks
      WHERE function_id = ${functionId}::uuid AND deleted_at IS NULL`,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM privacy_org_stakeholders
      WHERE function_id = ${functionId}::uuid AND deleted_at IS NULL`,
    // privacy_training_assignments has no deleted_at column — count all references.
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM privacy_training_assignments
      WHERE function_id = ${functionId}::uuid`,
    // privacy_compliance_tracking has no deleted_at column — count all references.
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM privacy_compliance_tracking
      WHERE addressed_by_function_id = ${functionId}::uuid`,
  ]);

  const blockers: Array<{ table: string; count: number }> = [];
  if (assignedUsers > 0) blockers.push({ table: 'Assigned Users', count: assignedUsers });
  const piCount = Number(piContextRows[0]?.count ?? 0);
  if (piCount > 0) blockers.push({ table: 'PI Contexts', count: piCount });
  const taskCount = Number(taskRows[0]?.count ?? 0);
  if (taskCount > 0) blockers.push({ table: 'Tasks', count: taskCount });
  const stakeholderCount = Number(stakeholderRows[0]?.count ?? 0);
  if (stakeholderCount > 0) blockers.push({ table: 'Stakeholders', count: stakeholderCount });
  const trainingCount = Number(trainingRows[0]?.count ?? 0);
  if (trainingCount > 0) blockers.push({ table: 'Training Assignments', count: trainingCount });
  const complianceCount = Number(complianceRows[0]?.count ?? 0);
  if (complianceCount > 0) blockers.push({ table: 'Compliance Records', count: complianceCount });

  if (blockers.length > 0) {
    throw Object.assign(
      new Error('Function cannot be removed — it is referenced by active records'),
      { code: 'FUNCTION_IN_USE', status: 409, blockers },
    );
  }

  // Soft-delete the function and hard-delete its FK-less grants atomically.
  // S-STATUS-MODEL: status='removed' marks it removed; deleted_at starts the
  // 30-day purge clock.
  await prisma.$transaction([
    prisma.coreFunction.update({
      where: { id: functionId },
      data: { status: 'removed', deleted_at: new Date() },
    }),
    prisma.coreUserFunctionGrant.deleteMany({
      where: { tenant_id: tenantId, function_id: functionId },
    }),
  ]);
}

// ── Locations ─────────────────────────────────────────────────────────────────

export async function listLocations(
  tenantId: string,
  includeInactive = false,
  type?: 'processing' | 'data_subject',
) {
  // S-STATUS-MODEL: filter on status (not is_active). active only → 'active';
  // includeInactive → active + deactivated (never 'removed').
  const where: Record<string, unknown> = { tenant_id: tenantId };
  where.status = includeInactive ? { in: ['active', 'deactivated'] } : 'active';
  if (type === 'processing') where.is_processing_location = true;
  if (type === 'data_subject') where.is_data_subject_location = true;
  const locs = await prisma.coreLocation.findMany({ where, orderBy: { name: 'asc' } });
  return locs.map(mapLocation);
}

export async function getLocationsByFunction(
  tenantId: string,
  _functionId: string,
): Promise<Array<{ countryCode: string; region: string | null }>> {
  const locs = await prisma.coreLocation.findMany({
    where: { tenant_id: tenantId, is_active: true },
    select: { country_code: true, region: true },
  });
  return locs
    .filter((l) => l.country_code)
    .map((l) => ({ countryCode: l.country_code, region: l.region ?? null }));
}

export async function createLocation(
  tenantId: string,
  createdBy: string,
  data: {
    name: string; countryCode: string; region?: string | null;
    isDataSubjectLocation?: boolean; isProcessingLocation?: boolean;
  },
) {
  const org = await prisma.coreOrgProfile.findFirst({ where: { tenant_id: tenantId, deleted_at: null } });
  if (!org) throw Object.assign(new Error('Organisation not found — complete wizard first'), { code: 'ORG_NOT_FOUND', status: 400 });

  // Batch B (#6): app-level duplicate-name guard (no DB unique index yet). Same
  // tenant-scoped, case-insensitive, deleted_at IS NULL predicate as functions.
  const dup = await prisma.coreLocation.findFirst({
    where: { tenant_id: tenantId, deleted_at: null, name: { equals: data.name.trim(), mode: 'insensitive' } },
  });
  if (dup) {
    throw Object.assign(new Error('A location with this name already exists'), { code: 'LOCATION_NAME_DUPLICATE', status: 409 });
  }

  const loc = await prisma.coreLocation.create({
    data: {
      tenant_id: tenantId,
      organisation_id: org.id,
      name: data.name,
      country_code: data.countryCode,
      region: data.region ?? null,
      is_data_subject_location: data.isDataSubjectLocation ?? false,
      is_processing_location: data.isProcessingLocation ?? false,
      created_by: createdBy,
    },
  });
  return mapLocation(loc);
}

export async function updateLocation(
  tenantId: string,
  locationId: string,
  data: {
    name?: string; countryCode?: string; region?: string | null;
    isDataSubjectLocation?: boolean; isProcessingLocation?: boolean;
  },
) {
  const existing = await prisma.coreLocation.findFirst({
    where: { id: locationId, tenant_id: tenantId },
  });
  if (!existing) throw Object.assign(new Error('Location not found'), { code: 'NOT_FOUND', status: 404 });

  // Batch B (#6): duplicate-name guard on rename — only when a (changed) name is
  // provided. Excludes self.
  if (data.name !== undefined && data.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
    const dup = await prisma.coreLocation.findFirst({
      where: {
        tenant_id: tenantId, deleted_at: null, id: { not: locationId },
        name: { equals: data.name.trim(), mode: 'insensitive' },
      },
    });
    if (dup) {
      throw Object.assign(new Error('A location with this name already exists'), { code: 'LOCATION_NAME_DUPLICATE', status: 409 });
    }
  }

  const loc = await prisma.coreLocation.update({
    where: { id: locationId },
    data: {
      name: data.name ?? existing.name,
      country_code: data.countryCode ?? existing.country_code,
      region: data.region !== undefined ? data.region : existing.region,
      is_data_subject_location: data.isDataSubjectLocation ?? existing.is_data_subject_location,
      is_processing_location: data.isProcessingLocation ?? existing.is_processing_location,
    },
  });
  return mapLocation(loc);
}

export async function deactivateLocation(tenantId: string, locationId: string) {
  // S-STATUS-MODEL: only an active location can be deactivated.
  const existing = await prisma.coreLocation.findFirst({
    where: { id: locationId, tenant_id: tenantId, status: 'active' },
  });
  if (!existing) throw Object.assign(new Error('Location not found'), { code: 'NOT_FOUND', status: 404 });

  const referencedUsers = await prisma.coreUser.count({
    where: { tenant_id: tenantId, location_id: locationId, is_active: true, deleted_at: null },
  });
  if (referencedUsers > 0) {
    throw Object.assign(
      new Error(`Cannot deactivate — ${referencedUsers} active user(s) have this as their base location`),
      { code: 'LOCATION_IN_USE', status: 409 },
    );
  }

  // S-STATUS-MODEL: keep is_active in sync with status (legacy callers still read it).
  await prisma.coreLocation.update({
    where: { id: locationId },
    data: { status: 'deactivated', is_active: false },
  });
}

// S-REACTIVATE: reverse of deactivateLocation — restore a deactivated location to
// active and bring is_active back in sync (legacy callers still read it). Only a
// status='deactivated' row (deleted_at NULL by invariant) is eligible; 'active' and
// 'removed' rows raise a typed 409. deleted_at is never touched.
export async function reactivateLocation(tenantId: string, locationId: string) {
  const existing = await prisma.coreLocation.findFirst({
    where: { id: locationId, tenant_id: tenantId, status: 'deactivated', deleted_at: null },
  });
  if (!existing) {
    throw Object.assign(
      new Error('Location cannot be reactivated — it is not in a deactivated state'),
      { code: 'LOCATION_NOT_DEACTIVATED', status: 409 },
    );
  }
  await prisma.coreLocation.update({
    where: { id: locationId },
    data: { status: 'active', is_active: true },
  });
}

// Permanent Remove for locations — mirrors removeFunction. Gated by a six-table
// dependency check (one Core table + five privacy_* tables counted via parameterised
// raw SQL; the privacy_* tables live in the same DB but outside the Core schema).
// NONE of the five privacy_* location-dependency tables carry a deleted_at column
// (verified against the live schema — same caution applied in the
// privacy_compliance_tracking fix), so each is counted in full. No grant cleanup —
// there is no user×location grant table. On success: status='removed',
// deleted_at=now() (purge clock), is_active=false (kept in sync).
export async function removeLocation(tenantId: string, locationId: string): Promise<void> {
  const existing = await prisma.coreLocation.findFirst({
    where: { id: locationId, tenant_id: tenantId, status: 'active' },
  });
  if (!existing) throw Object.assign(new Error('Location not found'), { code: 'NOT_FOUND', status: 404 });

  const [
    referencedUsers,
    contextLocRows,
    subjectLocRows,
    storageRows,
    processingRows,
    transferRows,
  ] = await Promise.all([
    // core_users.location_id — active users only (same as deactivate).
    prisma.coreUser.count({
      where: { tenant_id: tenantId, location_id: locationId, is_active: true, deleted_at: null },
    }),
    // The five privacy_* tables have no deleted_at — count all references.
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM privacy_pi_context_locations
      WHERE location_id = ${locationId}::uuid`,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM privacy_pi_subject_locations
      WHERE location_id = ${locationId}::uuid`,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM privacy_pi_storage_systems
      WHERE location_id = ${locationId}::uuid`,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM privacy_pi_processing_systems
      WHERE location_id = ${locationId}::uuid`,
    prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*)::int AS count FROM privacy_pi_transfers
      WHERE location_id = ${locationId}::uuid`,
  ]);

  const blockers: Array<{ table: string; count: number }> = [];
  if (referencedUsers > 0) blockers.push({ table: 'Assigned Users', count: referencedUsers });
  const contextCount = Number(contextLocRows[0]?.count ?? 0);
  if (contextCount > 0) blockers.push({ table: 'PI Contexts', count: contextCount });
  const subjectCount = Number(subjectLocRows[0]?.count ?? 0);
  if (subjectCount > 0) blockers.push({ table: 'Subject Locations', count: subjectCount });
  const storageCount = Number(storageRows[0]?.count ?? 0);
  if (storageCount > 0) blockers.push({ table: 'Storage Systems', count: storageCount });
  const processingCount = Number(processingRows[0]?.count ?? 0);
  if (processingCount > 0) blockers.push({ table: 'Processing Systems', count: processingCount });
  const transferCount = Number(transferRows[0]?.count ?? 0);
  if (transferCount > 0) blockers.push({ table: 'Transfers', count: transferCount });

  if (blockers.length > 0) {
    throw Object.assign(
      new Error('Location cannot be removed — it is referenced by active records'),
      { code: 'LOCATION_IN_USE', status: 409, blockers },
    );
  }

  await prisma.coreLocation.update({
    where: { id: locationId },
    data: { status: 'removed', deleted_at: new Date(), is_active: false },
  });
}

// ── Entities ──────────────────────────────────────────────────────────────────

export async function listEntities(tenantId: string) {
  const org = await prisma.coreOrgProfile.findFirst({ where: { tenant_id: tenantId, deleted_at: null } });
  if (!org) return [];

  const entities = await prisma.coreEntity.findMany({
    where: { tenant_id: tenantId, organisation_id: org.id },
    orderBy: [{ is_primary: 'desc' }, { created_at: 'asc' }],
  });
  return entities.map(mapEntity);
}

export async function createEntity(
  tenantId: string,
  createdBy: string,
  data: { name: string; legalName: string; countryCode: string; isPrimary?: boolean },
) {
  const org = await prisma.coreOrgProfile.findFirst({ where: { tenant_id: tenantId, deleted_at: null } });
  if (!org) throw Object.assign(new Error('Organisation not found — complete wizard first'), { code: 'ORG_NOT_FOUND', status: 400 });

  // Batch B (#6): app-level duplicate-name guard (no DB unique index yet). Same
  // tenant-scoped, case-insensitive, deleted_at IS NULL predicate as functions/locations.
  const dup = await prisma.coreEntity.findFirst({
    where: { tenant_id: tenantId, deleted_at: null, name: { equals: data.name.trim(), mode: 'insensitive' } },
  });
  if (dup) {
    throw Object.assign(new Error('An entity with this name already exists'), { code: 'ENTITY_NAME_DUPLICATE', status: 409 });
  }

  if (data.isPrimary) {
    await prisma.coreEntity.updateMany({
      where: { tenant_id: tenantId, is_primary: true, deleted_at: null },
      data: { is_primary: false },
    });
  }

  const entity = await prisma.coreEntity.create({
    data: {
      tenant_id: tenantId,
      organisation_id: org.id,
      name: data.name,
      legal_name: data.legalName,
      country_code: data.countryCode,
      is_primary: data.isPrimary ?? false,
      created_by: createdBy,
    },
  });
  return mapEntity(entity);
}

export async function updateEntity(
  tenantId: string,
  entityId: string,
  data: { name?: string; legalName?: string; countryCode?: string; isPrimary?: boolean },
) {
  const existing = await prisma.coreEntity.findFirst({
    where: { id: entityId, tenant_id: tenantId, deleted_at: null },
  });
  if (!existing) throw Object.assign(new Error('Entity not found'), { code: 'NOT_FOUND', status: 404 });

  // Batch B (#6): duplicate-name guard on rename — only when a (changed) name is
  // provided. Excludes self.
  if (data.name !== undefined && data.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
    const dup = await prisma.coreEntity.findFirst({
      where: {
        tenant_id: tenantId, deleted_at: null, id: { not: entityId },
        name: { equals: data.name.trim(), mode: 'insensitive' },
      },
    });
    if (dup) {
      throw Object.assign(new Error('An entity with this name already exists'), { code: 'ENTITY_NAME_DUPLICATE', status: 409 });
    }
  }

  if (data.isPrimary) {
    await prisma.coreEntity.updateMany({
      where: { tenant_id: tenantId, is_primary: true, deleted_at: null, id: { not: entityId } },
      data: { is_primary: false },
    });
  }

  const entity = await prisma.coreEntity.update({
    where: { id: entityId },
    data: {
      name: data.name ?? existing.name,
      legal_name: data.legalName ?? existing.legal_name,
      country_code: data.countryCode ?? existing.country_code,
      is_primary: data.isPrimary ?? existing.is_primary,
    },
  });
  return mapEntity(entity);
}

export async function deactivateEntity(tenantId: string, entityId: string) {
  const existing = await prisma.coreEntity.findFirst({
    where: { id: entityId, tenant_id: tenantId, deleted_at: null },
  });
  if (!existing) throw Object.assign(new Error('Entity not found'), { code: 'NOT_FOUND', status: 404 });

  await prisma.coreEntity.update({
    where: { id: entityId },
    data: { deleted_at: new Date() },
  });
}

// ── Stakeholders ──────────────────────────────────────────────────────────────

export async function listStakeholders(tenantId: string) {
  const org = await prisma.coreOrgProfile.findFirst({ where: { tenant_id: tenantId, deleted_at: null } });
  if (!org) return [];

  const stakeholders = await prisma.coreOrgStakeholder.findMany({
    where: { tenant_id: tenantId, organisation_id: org.id, deleted_at: null },
    orderBy: { created_at: 'asc' },
  });
  return stakeholders.map(mapStakeholder);
}

export async function createStakeholder(
  tenantId: string,
  createdBy: string,
  data: {
    name: string; roleTitle: string; email?: string | null; phone?: string | null;
    stakeholderType: string; stakeholderTypeOther?: string | null;
    functionId?: string | null; functionLabel?: string | null;
  },
) {
  const org = await prisma.coreOrgProfile.findFirst({ where: { tenant_id: tenantId, deleted_at: null } });
  if (!org) throw Object.assign(new Error('Organisation not found — complete wizard first'), { code: 'ORG_NOT_FOUND', status: 400 });

  const s = await prisma.coreOrgStakeholder.create({
    data: {
      tenant_id: tenantId,
      organisation_id: org.id,
      name: data.name,
      role_title: data.roleTitle,
      email: data.email ?? null,
      phone: data.phone ?? null,
      stakeholder_type: data.stakeholderType,
      stakeholder_type_other: data.stakeholderType === 'other' ? (data.stakeholderTypeOther ?? null) : null,
      function_id: data.functionId ?? null,
      function_label: data.functionLabel ?? null,
      created_by: createdBy,
    },
  });
  return mapStakeholder(s);
}

export async function updateStakeholder(
  tenantId: string,
  stakeholderId: string,
  data: {
    name?: string; roleTitle?: string; email?: string | null; phone?: string | null;
    stakeholderType?: string; stakeholderTypeOther?: string | null;
    functionId?: string | null; functionLabel?: string | null;
  },
) {
  const existing = await prisma.coreOrgStakeholder.findFirst({
    where: { id: stakeholderId, tenant_id: tenantId, deleted_at: null },
  });
  if (!existing) throw Object.assign(new Error('Stakeholder not found'), { code: 'NOT_FOUND', status: 404 });

  const resolvedType = data.stakeholderType ?? existing.stakeholder_type;
  const s = await prisma.coreOrgStakeholder.update({
    where: { id: stakeholderId },
    data: {
      name: data.name ?? existing.name,
      role_title: data.roleTitle ?? existing.role_title,
      email: data.email !== undefined ? data.email : existing.email,
      phone: data.phone !== undefined ? data.phone : existing.phone,
      stakeholder_type: resolvedType,
      stakeholder_type_other: resolvedType === 'other'
        ? (data.stakeholderTypeOther !== undefined ? data.stakeholderTypeOther : existing.stakeholder_type_other)
        : null,
      function_id: data.functionId !== undefined ? data.functionId : existing.function_id,
      function_label: data.functionLabel !== undefined ? data.functionLabel : existing.function_label,
    },
  });
  return mapStakeholder(s);
}

export async function removeStakeholder(tenantId: string, stakeholderId: string) {
  const existing = await prisma.coreOrgStakeholder.findFirst({
    where: { id: stakeholderId, tenant_id: tenantId, deleted_at: null },
  });
  if (!existing) throw Object.assign(new Error('Stakeholder not found'), { code: 'NOT_FOUND', status: 404 });

  await prisma.coreOrgStakeholder.update({
    where: { id: stakeholderId },
    data: { deleted_at: new Date() },
  });
}

// ── Role type registry ────────────────────────────────────────────────────────

export async function registerOrgRoleType(key: string, label: string) {
  return prisma.coreOrgRoleType.upsert({
    where: { key },
    create: { key, label },
    update: { label },
  });
}

export async function getRoleAssignment(tenantId: string, roleTypeKey: string) {
  return prisma.coreOrgRoleAssignment.findUnique({
    where: { tenant_id_role_type_key: { tenant_id: tenantId, role_type_key: roleTypeKey } },
  });
}

export async function upsertRoleAssignment(
  tenantId: string,
  roleTypeKey: string,
  data: {
    name?: string | null; email?: string | null; phone?: string | null;
    roleTitle?: string | null; appointmentDate?: string | null; notes?: string | null;
    createdBy?: string | null;
  },
) {
  return prisma.coreOrgRoleAssignment.upsert({
    where: { tenant_id_role_type_key: { tenant_id: tenantId, role_type_key: roleTypeKey } },
    create: {
      tenant_id: tenantId,
      role_type_key: roleTypeKey,
      name: data.name ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      role_title: data.roleTitle ?? null,
      appointment_date: data.appointmentDate ? new Date(data.appointmentDate) : null,
      notes: data.notes ?? null,
      created_by: data.createdBy ?? null,
    },
    update: {
      name: data.name !== undefined ? data.name : undefined,
      email: data.email !== undefined ? data.email : undefined,
      phone: data.phone !== undefined ? data.phone : undefined,
      role_title: data.roleTitle !== undefined ? data.roleTitle : undefined,
      appointment_date: data.appointmentDate !== undefined
        ? (data.appointmentDate ? new Date(data.appointmentDate) : null)
        : undefined,
      notes: data.notes !== undefined ? data.notes : undefined,
    },
  });
}
