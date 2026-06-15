// E2.5: Org Context functions extracted from Privacy organisation.service.ts.
// Uses gracie-core's Prisma client (CoreOrgProfile, CoreFunction, etc.)
// which @@map to existing Privacy PostgreSQL tables (no migrations for those tables).
import prisma from '../../lib/prisma.js';

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapOrg(o: {
  id: string; tenant_id: string; name: string; website: string | null;
  address: string | null; contact_email: string | null; contact_phone: string | null;
  industry_sector: string | null; employee_band: string | null;
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
  created_at: Date; updated_at: Date; deleted_at: Date | null;
  head_user?: { first_name: string; last_name: string } | null;
}) {
  return {
    id: f.id, tenantId: f.tenant_id, organisationId: f.organisation_id,
    name: f.name, description: f.description, headUserId: f.head_user_id,
    headUserName: f.head_user ? `${f.head_user.first_name} ${f.head_user.last_name}` : null,
    createdBy: f.created_by, createdAt: f.created_at.toISOString(),
    updatedAt: f.updated_at.toISOString(), deletedAt: f.deleted_at?.toISOString() ?? null,
    isActive: f.deleted_at === null,
  };
}

function mapLocation(l: {
  id: string; tenant_id: string; organisation_id: string; name: string; country_code: string;
  region: string | null; is_data_subject_location: boolean; is_processing_location: boolean;
  is_active: boolean; created_by: string | null; created_at: Date; updated_at: Date;
}) {
  return {
    id: l.id, tenantId: l.tenant_id, organisationId: l.organisation_id,
    name: l.name, countryCode: l.country_code, region: l.region,
    isDataSubjectLocation: l.is_data_subject_location,
    isProcessingLocation: l.is_processing_location,
    isActive: l.is_active, createdBy: l.created_by,
    createdAt: l.created_at.toISOString(), updatedAt: l.updated_at.toISOString(),
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
    industrySector?: string | null;
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
        industry_sector: data.industrySector ?? null,
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
  const fns = await prisma.coreFunction.findMany({
    where: {
      tenant_id: tenantId,
      ...(includeInactive ? {} : { deleted_at: null }),
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
  const existing = await prisma.coreFunction.findFirst({
    where: { id: functionId, tenant_id: tenantId, deleted_at: null },
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

  await prisma.coreFunction.update({
    where: { id: functionId },
    data: { deleted_at: new Date() },
  });
}

// ── Locations ─────────────────────────────────────────────────────────────────

export async function listLocations(
  tenantId: string,
  includeInactive = false,
  type?: 'processing' | 'data_subject',
) {
  const where: Record<string, unknown> = { tenant_id: tenantId };
  if (!includeInactive) where.is_active = true;
  if (type === 'processing') where.is_processing_location = true;
  if (type === 'data_subject') where.is_data_subject_location = true;
  const locs = await prisma.coreLocation.findMany({ where, orderBy: { name: 'asc' } });
  return locs.map(mapLocation);
}

export async function getLocationsByFunction(tenantId: string, _functionId: string): Promise<string[]> {
  const locs = await prisma.coreLocation.findMany({
    where: { tenant_id: tenantId, is_active: true },
    select: { country_code: true },
  });
  return locs.map((l) => l.country_code).filter(Boolean);
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
  const existing = await prisma.coreLocation.findFirst({
    where: { id: locationId, tenant_id: tenantId },
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

  await prisma.coreLocation.update({
    where: { id: locationId },
    data: { is_active: false },
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
