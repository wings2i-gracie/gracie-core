// @wings2i-gracie/core — E2.1: Auth, Users, Middleware

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
  getUsers,
  getUserById,
  updateUser,
  deactivateUser,
  resetPassword,
} from './modules/users/users.service.js';
