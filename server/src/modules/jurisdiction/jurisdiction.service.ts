// 1a: Jurisdiction Directory — GLOBAL reference data (Wings2i-maintained).
//
// core_jurisdiction_act (parent) holds a legal act/instrument; each child
// core_jurisdiction_act_region row names one jurisdiction (country_code + optional
// sub-national region) the act applies to. The directory is purely GLOBAL — there
// is NO tenant scoping here. Dedicated reads/writes; do NOT reuse the regulation
// derivation-data path.
import prisma from '../../lib/prisma.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface JurisdictionActRegion {
  id: string;
  actId: string;
  countryCode: string;
  region: string | null;
  authorityName: string | null;
  authorityWebsite: string | null;
  authorityEmail: string | null;
  authorityPhone: string | null;
  authorityPostalAddress: string | null;
}

export interface JurisdictionAct {
  id: string;
  actName: string;
  authority: string | null;
  officialUrl: string | null;
  regulationId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  regions: JurisdictionActRegion[];
}

// ── Mappers ──────────────────────────────────────────────────────────────────

function mapRegion(r: {
  id: string;
  act_id: string;
  country_code: string;
  region: string | null;
  authority_name?: string | null;
  authority_website?: string | null;
  authority_email?: string | null;
  authority_phone?: string | null;
  authority_postal_address?: string | null;
}): JurisdictionActRegion {
  return {
    id: r.id,
    actId: r.act_id,
    countryCode: r.country_code,
    region: r.region ?? null,
    authorityName: r.authority_name ?? null,
    authorityWebsite: r.authority_website ?? null,
    authorityEmail: r.authority_email ?? null,
    authorityPhone: r.authority_phone ?? null,
    authorityPostalAddress: r.authority_postal_address ?? null,
  };
}

function mapAct(a: {
  id: string;
  act_name: string;
  authority: string | null;
  official_url: string | null;
  regulation_id: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  regions?: Array<{
    id: string;
    act_id: string;
    country_code: string;
    region: string | null;
    authority_name?: string | null;
    authority_website?: string | null;
    authority_email?: string | null;
    authority_phone?: string | null;
    authority_postal_address?: string | null;
  }>;
}): JurisdictionAct {
  return {
    id: a.id,
    actName: a.act_name,
    authority: a.authority ?? null,
    officialUrl: a.official_url ?? null,
    regulationId: a.regulation_id ?? null,
    isActive: Boolean(a.is_active),
    createdAt: a.created_at.toISOString(),
    updatedAt: a.updated_at.toISOString(),
    regions: (a.regions ?? []).map(mapRegion),
  };
}

function isP2002(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** All acts, regions nested. No tenant param — the directory is GLOBAL. */
export async function listJurisdictionActs(): Promise<JurisdictionAct[]> {
  const acts = await prisma.coreJurisdictionAct.findMany({
    include: { regions: true },
    orderBy: { act_name: 'asc' },
  });
  return acts.map(mapAct);
}

/** A single act with regions nested. 404 if missing. */
export async function getJurisdictionAct(id: string): Promise<JurisdictionAct> {
  const act = await prisma.coreJurisdictionAct.findUnique({
    where: { id },
    include: { regions: true },
  });
  if (!act)
    throw Object.assign(new Error('Jurisdiction act not found'), {
      statusCode: 404,
      code: 'NOT_FOUND',
    });
  return mapAct(act);
}

// ── Writes ───────────────────────────────────────────────────────────────────

export interface CreateJurisdictionActInput {
  actName?: string;
  authority?: string | null;
  officialUrl?: string | null;
  regulationId?: string | null;
  isActive?: boolean;
  regions?: Array<{
    countryCode: string;
    region?: string | null;
    authorityName?: string | null;
    authorityWebsite?: string | null;
    authorityEmail?: string | null;
    authorityPhone?: string | null;
    authorityPostalAddress?: string | null;
  }>;
}

/** Create an act, optionally with nested regions. 400 if act_name missing,
 *  409 on a duplicate (act_id, country_code, region) jurisdiction. */
export async function createJurisdictionAct(
  data: CreateJurisdictionActInput,
): Promise<JurisdictionAct> {
  const actName = (data.actName ?? '').trim();
  if (!actName)
    throw Object.assign(new Error('actName is required'), {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });

  try {
    const act = await prisma.coreJurisdictionAct.create({
      data: {
        act_name: actName,
        authority: data.authority ?? null,
        official_url: data.officialUrl ?? null,
        regulation_id: data.regulationId ?? null,
        is_active: data.isActive ?? true,
        regions: data.regions?.length
          ? {
              create: data.regions.map((rg) => ({
                country_code: rg.countryCode,
                region: rg.region ?? null,
                authority_name: rg.authorityName ?? null,
                authority_website: rg.authorityWebsite ?? null,
                authority_email: rg.authorityEmail ?? null,
                authority_phone: rg.authorityPhone ?? null,
                authority_postal_address: rg.authorityPostalAddress ?? null,
              })),
            }
          : undefined,
      },
      include: { regions: true },
    });
    return mapAct(act);
  } catch (e) {
    if (isP2002(e))
      throw Object.assign(new Error('Duplicate jurisdiction for this act'), {
        statusCode: 409,
        code: 'DUPLICATE_JURISDICTION',
      });
    throw e;
  }
}

export interface UpdateJurisdictionActInput {
  actName?: string;
  authority?: string | null;
  officialUrl?: string | null;
  regulationId?: string | null;
  isActive?: boolean;
}

/** Update act fields (not regions). 404 if missing. */
export async function updateJurisdictionAct(
  id: string,
  data: UpdateJurisdictionActInput,
): Promise<JurisdictionAct> {
  const existing = await prisma.coreJurisdictionAct.findUnique({ where: { id }, select: { id: true } });
  if (!existing)
    throw Object.assign(new Error('Jurisdiction act not found'), {
      statusCode: 404,
      code: 'NOT_FOUND',
    });

  const act = await prisma.coreJurisdictionAct.update({
    where: { id },
    data: {
      ...(data.actName !== undefined ? { act_name: data.actName.trim() } : {}),
      ...(data.authority !== undefined ? { authority: data.authority } : {}),
      ...(data.officialUrl !== undefined ? { official_url: data.officialUrl } : {}),
      ...(data.regulationId !== undefined ? { regulation_id: data.regulationId } : {}),
      ...(data.isActive !== undefined ? { is_active: data.isActive } : {}),
    },
    include: { regions: true },
  });
  return mapAct(act);
}

/** Add one region to an act. 404 if act missing, 409 on duplicate jurisdiction. */
export async function addJurisdictionRegion(
  actId: string,
  data: {
    countryCode: string;
    region?: string | null;
    authorityName?: string | null;
    authorityWebsite?: string | null;
    authorityEmail?: string | null;
    authorityPhone?: string | null;
    authorityPostalAddress?: string | null;
  },
): Promise<JurisdictionActRegion> {
  const act = await prisma.coreJurisdictionAct.findUnique({ where: { id: actId }, select: { id: true } });
  if (!act)
    throw Object.assign(new Error('Jurisdiction act not found'), {
      statusCode: 404,
      code: 'NOT_FOUND',
    });

  try {
    const row = await prisma.coreJurisdictionActRegion.create({
      data: {
        act_id: actId,
        country_code: data.countryCode,
        region: data.region ?? null,
        authority_name: data.authorityName ?? null,
        authority_website: data.authorityWebsite ?? null,
        authority_email: data.authorityEmail ?? null,
        authority_phone: data.authorityPhone ?? null,
        authority_postal_address: data.authorityPostalAddress ?? null,
      },
    });
    return mapRegion(row);
  } catch (e) {
    if (isP2002(e))
      throw Object.assign(new Error('Duplicate jurisdiction for this act'), {
        statusCode: 409,
        code: 'DUPLICATE_JURISDICTION',
      });
    throw e;
  }
}

export interface UpdateJurisdictionRegionInput {
  countryCode?: string;
  region?: string | null;
  authorityName?: string | null;
  authorityWebsite?: string | null;
  authorityEmail?: string | null;
  authorityPhone?: string | null;
  authorityPostalAddress?: string | null;
}

/** Update an existing region row. The five authority-contact fields are always
 *  editable; the jurisdiction key (country_code/region) may also be changed here
 *  (it stays immutable on createJurisdictionAct's nested path and addJurisdictionRegion).
 *  404 if the region is missing. When the key changes, a pre-flight duplicate guard
 *  rejects a clashing (act_id, country_code, region) with a typed 409 — the DB
 *  uniqueness constraint remains the source of truth. GLOBAL: no tenant param. */
export async function updateJurisdictionRegion(
  regionId: string,
  data: UpdateJurisdictionRegionInput,
): Promise<JurisdictionActRegion> {
  const existing = await prisma.coreJurisdictionActRegion.findUnique({
    where: { id: regionId },
    select: { id: true, act_id: true, country_code: true, region: true },
  });
  if (!existing)
    throw Object.assign(new Error('Jurisdiction region not found'), {
      statusCode: 404,
      code: 'NOT_FOUND',
    });

  // Pre-flight duplicate guard: only when the jurisdiction key is changing.
  if (data.countryCode !== undefined || data.region !== undefined) {
    const nextCountry = data.countryCode ?? existing.country_code;
    const nextRegion = data.region !== undefined ? data.region : existing.region;
    const clash = await prisma.coreJurisdictionActRegion.findFirst({
      where: {
        act_id: existing.act_id,
        country_code: nextCountry,
        region: nextRegion,
        id: { not: regionId },
      },
      select: { id: true },
    });
    if (clash)
      throw Object.assign(new Error('Duplicate jurisdiction for this act'), {
        statusCode: 409,
        code: 'DUPLICATE_JURISDICTION',
      });
  }

  try {
    const row = await prisma.coreJurisdictionActRegion.update({
      where: { id: regionId },
      data: {
        ...(data.countryCode !== undefined ? { country_code: data.countryCode } : {}),
        ...(data.region !== undefined ? { region: data.region } : {}),
        ...(data.authorityName !== undefined ? { authority_name: data.authorityName } : {}),
        ...(data.authorityWebsite !== undefined ? { authority_website: data.authorityWebsite } : {}),
        ...(data.authorityEmail !== undefined ? { authority_email: data.authorityEmail } : {}),
        ...(data.authorityPhone !== undefined ? { authority_phone: data.authorityPhone } : {}),
        ...(data.authorityPostalAddress !== undefined
          ? { authority_postal_address: data.authorityPostalAddress }
          : {}),
      },
    });
    return mapRegion(row);
  } catch (e) {
    if (isP2002(e))
      throw Object.assign(new Error('Duplicate jurisdiction for this act'), {
        statusCode: 409,
        code: 'DUPLICATE_JURISDICTION',
      });
    throw e;
  }
}

/** Delete one region row. No-op if it does not exist. */
export async function removeJurisdictionRegion(regionId: string): Promise<void> {
  await prisma.coreJurisdictionActRegion.deleteMany({ where: { id: regionId } });
}
