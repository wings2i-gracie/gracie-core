// Seq 4c-0: user×function ownership grant — Core-owned shared capability.
//
// One user may own MANY functions; ownership GRANTS access. This SUPPLEMENTS
// (does NOT replace) CoreUser.function_id. Consumers (Privacy, Compliance C-DD8)
// must use this single implementation — no product-local copies.
//
// Resolution is done fresh at request time (no JWT/token change) so new grants
// take effect immediately without re-login.
import prisma from '../../lib/prisma.js';

/**
 * All function IDs explicitly granted to a user via core_user_function_grants.
 * Tenant-scoped, excludes soft-deleted grants. Order-stable (function_id asc).
 * Returns [] when the user owns no granted functions (e.g. empty grant table).
 */
export async function resolveOwnedFunctionIds(
  userId: string,
  tenantId: string,
): Promise<string[]> {
  const rows = await prisma.coreUserFunctionGrant.findMany({
    where: { tenant_id: tenantId, user_id: userId, deleted_at: null },
    select: { function_id: true },
    orderBy: { function_id: 'asc' },
  });
  return rows.map((r) => r.function_id);
}

/**
 * The full set of function IDs a user can access by function membership:
 * the UNION of their single function_id (if set) and every granted function.
 *
 * SUPPLEMENT semantics — when the grant table is empty this returns exactly
 * `[functionId]` (or `[]` if functionId is null), i.e. bit-for-bit today's
 * single-function behaviour. Deduplicated; order-stable.
 */
export async function resolveFunctionScope(
  user: { id: string; functionId: string | null },
  tenantId: string,
): Promise<string[]> {
  const owned = await resolveOwnedFunctionIds(user.id, tenantId);
  const set = new Set<string>(owned);
  if (user.functionId) set.add(user.functionId);
  return Array.from(set);
}

/** Grant a user ownership of a function. Idempotent: re-granting revives a
 * soft-deleted grant rather than failing the unique constraint.
 *
 * Tenant-ownership is enforced here (not just at the router) because this is the
 * single shared Core write path — every consumer (Privacy, Compliance) inherits
 * the guarantee that a user can only be granted functions within `tenantId`.
 * Throws NOT_FOUND (status 404) if the target user or function does not belong
 * to the tenant. */
export async function grantFunctionToUser(params: {
  tenantId: string;
  userId: string;
  functionId: string;
  grantedBy?: string | null;
}): Promise<{ id: string; userId: string; functionId: string }> {
  const { tenantId, userId, functionId, grantedBy } = params;

  const targetUser = await prisma.coreUser.findFirst({
    where: { id: userId, tenant_id: tenantId, deleted_at: null },
    select: { id: true },
  });
  if (!targetUser)
    throw Object.assign(new Error('Target user not found in tenant'), { code: 'NOT_FOUND', status: 404 });

  const targetFunction = await prisma.coreFunction.findFirst({
    where: { id: functionId, tenant_id: tenantId, deleted_at: null },
    select: { id: true },
  });
  if (!targetFunction)
    throw Object.assign(new Error('Target function not found in tenant'), { code: 'NOT_FOUND', status: 404 });

  const existing = await prisma.coreUserFunctionGrant.findUnique({
    where: {
      tenant_id_user_id_function_id: {
        tenant_id: tenantId,
        user_id: userId,
        function_id: functionId,
      },
    },
    select: { id: true },
  });

  const row = existing
    ? await prisma.coreUserFunctionGrant.update({
        where: { id: existing.id },
        data: { deleted_at: null, granted_by: grantedBy ?? null },
        select: { id: true, user_id: true, function_id: true },
      })
    : await prisma.coreUserFunctionGrant.create({
        data: {
          tenant_id: tenantId,
          user_id: userId,
          function_id: functionId,
          granted_by: grantedBy ?? null,
        },
        select: { id: true, user_id: true, function_id: true },
      });

  return { id: row.id, userId: row.user_id, functionId: row.function_id };
}

/** Soft-delete a user's grant for a function. No-op if no active grant exists. */
export async function revokeFunctionGrant(params: {
  tenantId: string;
  userId: string;
  functionId: string;
}): Promise<void> {
  const { tenantId, userId, functionId } = params;
  await prisma.coreUserFunctionGrant.updateMany({
    where: { tenant_id: tenantId, user_id: userId, function_id: functionId, deleted_at: null },
    data: { deleted_at: new Date() },
  });
}

/** List a user's active function grants (tenant-scoped). */
export async function listFunctionGrants(
  userId: string,
  tenantId: string,
): Promise<Array<{ id: string; functionId: string; grantedBy: string | null; createdAt: string }>> {
  const rows = await prisma.coreUserFunctionGrant.findMany({
    where: { tenant_id: tenantId, user_id: userId, deleted_at: null },
    select: { id: true, function_id: true, granted_by: true, created_at: true },
    orderBy: { created_at: 'asc' },
  });
  return rows.map((r) => ({
    id: r.id,
    functionId: r.function_id,
    grantedBy: r.granted_by,
    createdAt: r.created_at.toISOString(),
  }));
}
