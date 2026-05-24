// @wings2i-gracie/core — E2.3: Audit log service + router extracted from Privacy

export {
  generateAccessToken,
  buildTokenPayload,
  validateCredentials,
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  generateTempPassword,
  type UserRole,
  type CoreTokenPayload,
} from './modules/auth/auth.service.js';

export {
  requireAuth,
  requireTenant,
} from './middleware/auth.middleware.js';

export {
  requireRole,
  checkModuleAccess,
  checkModuleEdit,
} from './middleware/rbac.middleware.js';

export {
  registerModules,
  upsertModuleRegistry,
  isModuleRegistered,
  getRegisteredModuleKeys,
} from './modules/permissions/permissions.service.js';

export {
  getUsers,
  getUserById,
  updateUser,
  deactivateUser,
  resetPassword,
} from './modules/users/users.service.js';

export {
  auditLog,
  getAuditLogs,
  exportAuditLogsAsCsv,
  type AuditLogParams,
} from './modules/audit/audit.service.js';

export { default as coreAuditRouter } from './modules/audit/audit.router.js';
