import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
interface JwtPayload {
  id: string;
  email: string;
  role: string;
  tenantId: string | null;
  organisationId: string | null;
  functionId: string | null;
  locationId: string | null;
  isSupportMode?: boolean;
  originalRole?: string;
  organisationName?: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authentication required', code: 'UNAUTHORIZED' });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const secret = process.env.CORE_JWT_SECRET ?? process.env.JWT_ACCESS_SECRET;
    if (!secret) throw new Error('JWT secret not configured');
    const payload = jwt.verify(token, secret) as JwtPayload;
    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId,
      organisationId: payload.organisationId,
      functionId: payload.functionId,
      locationId: payload.locationId ?? null,
      isSupportMode: payload.isSupportMode,
      originalRole: payload.originalRole,
      organisationName: payload.organisationName,
    };
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token', code: 'TOKEN_INVALID' });
  }
}

export function requireTenant(req: Request, res: Response, next: NextFunction): void {
  if (!req.user?.tenantId) {
    res.status(403).json({ success: false, error: 'Tenant context required', code: 'NO_TENANT' });
    return;
  }
  next();
}
