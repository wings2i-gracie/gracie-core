import bcrypt from 'bcryptjs';
import prisma from '../../lib/prisma.js';
import type { UserRole } from '../auth/auth.service.js';
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
      function_id: true,
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
  role: UserRole,
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
      ...(functionId !== undefined ? { function_id: functionId || null } : {}),
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
