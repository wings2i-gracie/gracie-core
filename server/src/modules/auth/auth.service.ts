import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../../lib/prisma.js';

export type UserRole =
  | 'super_admin'
  | 'org_admin'
  | 'compliance_manager'
  | 'leadership'
  | 'function_owner'
  | 'context_owner'
  | 'auditor'
  | 'viewer';

export interface CoreTokenPayload {
  id: string;
  email: string;
  role: UserRole;
  tenantId: string | null;
  organisationId: string | null;
  functionId: string | null;
  locationId: string | null;
}

export function generateAccessToken(payload: CoreTokenPayload): string {
  return jwt.sign(payload, process.env.CORE_JWT_SECRET!, {
    expiresIn: (process.env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn']) || '15m',
  });
}

export function buildTokenPayload(user: {
  id: string;
  email: string;
  role: UserRole;
  tenant_id: string | null;
  organisation_id: string | null;
  function_id: string | null;
  location_id: string | null;
}): CoreTokenPayload {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenant_id,
    organisationId: user.organisation_id,
    functionId: user.function_id,
    locationId: user.location_id,
  };
}

export async function validateCredentials(email: string, password: string) {
  const user = await prisma.coreUser.findFirst({
    where: { email: email.toLowerCase().trim() },
  });

  if (!user || user.deleted_at) return null;
  if (!user.is_active) return null;

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;

  return user;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function validatePasswordPolicy(password: string): boolean {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[!@#$%^&*()\-_=+[\]{};':"\\|,.<>/?]/.test(password)
  );
}

export function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%^&*';
  const pool = upper + lower + digits + special;
  const required = [
    upper[crypto.randomInt(upper.length)],
    digits[crypto.randomInt(digits.length)],
    special[crypto.randomInt(special.length)],
  ];
  const rest = Array.from({ length: 9 }, () => pool[crypto.randomInt(pool.length)]);
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
