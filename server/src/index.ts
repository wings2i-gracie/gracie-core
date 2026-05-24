// @wings2i-gracie/core — E2.2: Permissions registry + RBAC middleware added

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
