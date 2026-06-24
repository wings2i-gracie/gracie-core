import bcrypt from 'bcryptjs';
import prisma from '../../lib/prisma.js';
import { Prisma } from '../../generated/prisma-client/index.js';
import { generateTempPassword } from '../auth/auth.service.js';

export async function getUsers(tenantId: string) {
  return prisma.coreUser.findMany({
    where: { tenant_id: tenantId, deleted_at: null },
    select: {
      id: true,
      email: true,
      first_name: true,
      last_name: true,
      role: true,
      location_id: true,
      is_active: true,
      last_login_at: true,
      created_at: true,
    },
    orderBy: { created_at: 'asc' },
  });
}

export async function getUserById(tenantId: string, userId: string) {
  return prisma.coreUser.findFirst({
    where: { id: userId, tenant_id: tenantId, deleted_at: null },
  });
}

export async function updateUser(
  tenantId: string,
  userId: string,
  actorId: string,
  role: string,
  // 5B: function_id column dropped from core_users — the function axis lives in
  // core_user_function_grants now. Param kept for call-site compatibility but no
  // longer written here; grant writes happen via grantFunctionToUser.
  functionId?: string | null,
  locationId?: string | null,
) {
  const user = await prisma.coreUser.findFirst({
    where: { id: userId, tenant_id: tenantId, deleted_at: null },
  });
  if (!user) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND', status: 404 });
  if (user.role === 'super_admin') throw Object.assign(new Error('Cannot modify super admin'), { code: 'FORBIDDEN', status: 403 });
  if (userId === actorId && role !== user.role) throw Object.assign(new Error('Cannot change your own role'), { code: 'SELF_ROLE_CHANGE', status: 400 });

  return prisma.coreUser.update({
    where: { id: userId },
    data: {
      role,
      ...(locationId !== undefined ? { location_id: locationId || null } : {}),
    },
  });
}

export async function deactivateUser(tenantId: string, userId: string, actorId: string) {
  if (userId === actorId) throw Object.assign(new Error('Cannot deactivate yourself'), { code: 'SELF_DEACTIVATE', status: 400 });
  const user = await prisma.coreUser.findFirst({ where: { id: userId, tenant_id: tenantId, deleted_at: null } });
  if (!user) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND', status: 404 });

  return prisma.coreUser.update({ where: { id: userId }, data: { is_active: false } });
}

/**
 * Outcome of {@link deleteUserCleanOrSoft}: either a permanent hard delete of a
 * clean (never-active) account, or a soft delete because the account has history.
 */
export type DeleteUserResult =
  | { mode: 'hard' }
  | { mode: 'soft'; reason: 'has_history' };

/**
 * Deletes a user, HARD-deleting only "clean" (never-active) accounts and
 * SOFT-deleting anything with history. The hard delete removes a `core_users`
 * row, so the decision lives here in Core (which owns the table); Privacy's
 * admin deleteUser calls in.
 *
 * Class-2 targeted pre-check — the two reference columns the DB will NOT police
 * (plain-UUID columns with no FK constraint, so a hard delete would orphan them
 * silently rather than raise P2003):
 *   - core_user_function_grants.user_id   (grant rows are plain-UUID refs)
 *   - core_tenants.org_admin_user_id      (plain Uuid, no relation)
 * If either has a row, the account has history → soft delete.
 *
 * If the pre-check is clean, attempt the hard delete inside a transaction. Every
 * OTHER reference (audit log, tasks, headed functions, …) IS policed by a real FK
 * and surfaces as a P2003 known-request error — the txn rolls back and we fall
 * back to a soft delete. So only a fully unreferenced row is ever hard-deleted.
 *
 * Existence + tenant scoping are enforced here. The self-delete guard stays at
 * the Privacy call site (it owns actorId semantics); `actorId` is accepted for
 * call-site parity and audit context.
 */
export async function deleteUserCleanOrSoft(
  userId: string,
  tenantId: string,
  actorId: string,
): Promise<DeleteUserResult> {
  void actorId;
  const user = await prisma.coreUser.findFirst({
    where: { id: userId, tenant_id: tenantId, deleted_at: null },
    select: { id: true },
  });
  if (!user) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND', status: 404 });

  // ── Class-2 pre-check: the two columns the DB won't police ──
  const grantCount = await prisma.coreUserFunctionGrant.count({
    where: { user_id: userId },
  });
  const orgAdminCount = await prisma.coreTenant.count({
    where: { org_admin_user_id: userId },
  });
  if (grantCount > 0 || orgAdminCount > 0) {
    await prisma.coreUser.update({ where: { id: userId }, data: { deleted_at: new Date() } });
    return { mode: 'soft', reason: 'has_history' };
  }

  // ── Clean: attempt hard delete; any DB-policed FK rolls back → soft fallback ──
  try {
    await prisma.$transaction(async (tx) => {
      await tx.coreUser.delete({ where: { id: userId } });
    });
    return { mode: 'hard' };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      await prisma.coreUser.update({ where: { id: userId }, data: { deleted_at: new Date() } });
      return { mode: 'soft', reason: 'has_history' };
    }
    throw err;
  }
}

export async function resetPassword(tenantId: string, targetId: string, actorId: string) {
  if (targetId === actorId)
    throw Object.assign(new Error('Use "Change Password" to update your own password'), { code: 'SELF_RESET', status: 400 });
  const user = await prisma.coreUser.findFirst({
    where: { id: targetId, tenant_id: tenantId, deleted_at: null },
  });
  if (!user) throw Object.assign(new Error('User not found'), { code: 'NOT_FOUND', status: 404 });
  if (user.role === 'super_admin')
    throw Object.assign(new Error('Cannot reset a super admin password'), { code: 'FORBIDDEN', status: 403 });

  const tempPassword = generateTempPassword();
  const password_hash = await bcrypt.hash(tempPassword, 12);

  await prisma.coreUser.update({
    where: { id: targetId },
    data: { password_hash, must_change_password: true },
  });

  return { tempPassword, user };
}
