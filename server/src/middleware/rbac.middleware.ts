import { Request, Response, NextFunction } from 'express';
import { isModuleRegistered } from '../modules/permissions/permissions.service.js';

/**
 * Checks that the authenticated user's role is one of the allowed roles.
 * Products re-export this from Core — no Privacy-specific knowledge here.
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, error: 'Authentication required', code: 'UNAUTHORIZED' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, error: 'Insufficient permissions', code: 'FORBIDDEN' });
      return;
    }
    next();
  };
}

/**
 * Base module access gate — auth check, support-mode bypass, and registry validation.
 * Products (e.g. Privacy) wrap this with product-specific tier/feature/role checks.
 * Returns 403 MODULE_NOT_REGISTERED if the key was never registered via registerModules().
 */
export function checkModuleAccess(moduleKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }
      if (req.user.isSupportMode) { next(); return; }
      if (!isModuleRegistered(moduleKey)) {
        res.status(403).json({ success: false, error: 'Module not registered', code: 'MODULE_NOT_REGISTERED' });
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Base module edit gate — auth check and support-mode bypass.
 * Products layer their own edit-permission DB check on top of this.
 */
export function checkModuleEdit(moduleKey: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ success: false, error: 'Authentication required', code: 'UNAUTHORIZED' });
        return;
      }
      if (req.user.isSupportMode) { next(); return; }
      // Product-specific edit check delegated to the product's permissions shim.
      next();
    } catch (err) {
      next(err);
    }
  };
}
