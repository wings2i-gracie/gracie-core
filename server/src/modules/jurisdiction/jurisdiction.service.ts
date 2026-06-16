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
}): JurisdictionActRegion {
  return {
    id: r.id,
    actId: r.act_id,
    countryCode: r.country_code,
    region: r.region ?? null,
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
  regions?: Array<{ id: string; act_id: string; country_code: string; region: string | null }>;
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
  regions?: Array<{ countryCode: string; region?: string | null }>;
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
  data: { countryCode: string; region?: string | null },
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
