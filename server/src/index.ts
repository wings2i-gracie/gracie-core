// @wings2i-gracie/core — E2.6: Tasks engine + E2.5: Org Context

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

export {
  uploadFile,
  getFile,
  deleteFile,
  getFilesByModule,
} from './modules/storage/storage.service.js';

export { LocalStorageProvider } from './modules/storage/LocalStorageProvider.js';

// ── E2.5: Org Context ─────────────────────────────────────────────────────────

export { default as coreOrgRouter } from './modules/orgContext/orgContext.router.js';

export {
  getOrgProfile,
  getOrCreateOrgProfile,
  upsertOrgProfile,
  listFunctions,
  createFunction,
  updateFunction,
  deactivateFunction,
  listLocations,
  getLocationsByFunction,
  createLocation,
  updateLocation,
  deactivateLocation,
  listEntities,
  createEntity,
  updateEntity,
  deactivateEntity,
  listStakeholders,
  createStakeholder,
  updateStakeholder,
  removeStakeholder,
  registerOrgRoleType,
  getRoleAssignment,
  upsertRoleAssignment,
  getDpoDetails,
  upsertDpoDetails,
} from './modules/orgContext/orgContext.service.js';

// ── E2.6: Tasks ───────────────────────────────────────────────────────────────

export {
  createTask,
  listTasks,
  getTaskById,
  updateTask,
  softDeleteTask,
  getTaskStats,
  listTemplates,
  createTemplate,
  createTaskFromTemplate,
  seedSystemTemplates,
  CoreTaskStatus,
  CoreTaskPriority,
  CoreTaskSource,
  CoreTaskRecurrenceFrequency,
  type CreateTaskInput,
  type ListTasksFilter,
} from './modules/tasks/tasks.service.js';

export { default as coreTasksRouter } from './modules/tasks/tasks.router.js';

// ── E2.7: Notifications ───────────────────────────────────────────────────────

export {
  createNotification,
  notificationDispatch,
  getUnreadCount,
  listNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  type CreateNotificationParams,
  type ListNotificationsFilter,
} from './modules/notifications/notifications.service.js';

export { default as coreNotificationsRouter } from './modules/notifications/notifications.router.js';

// ── E2.8a: Regulation Library ─────────────────────────────────────────────────

export {
  listRegulations,
  getRegulation,
  listRequirements,
  listPrinciples,
  listDocuments,
  getEnabledRegulationsForTenant,
  listRegulationsWithToggles,
  toggleRegulation,
  createRegulation as coreCreateRegulation,
  updateRegulation as coreUpdateRegulation,
  publishRegulation as corePublishRegulation,
  deprecateRegulation as coreDeprecateRegulation,
  deleteRegulation as coreDeleteRegulation,
  listDocumentsForTenant as coreListDocumentsForTenant,
  listDocumentsForRegulation as coreListDocumentsForRegulation,
  type CoreRegulationSummary,
  type CoreRegulationWithToggle,
} from './modules/regulation/regulation.service.js';

export { default as coreRegulationsRouter } from './modules/regulation/regulation.router.js';

// ── E2.9: AI Configuration + Usage Logging ───────────────────────────────────

export {
  getAiConfig,
  saveAiConfig,
  removeAiConfig,
  resolveAiCredentials,
  getAiConfigStatusForAdmin,
  logAiUsage,
  estimateCost,
  aiComplete,
  type AiConfigSaveInput,
  type LogAiUsageParams,
} from './modules/ai/ai.service.js';

export { default as coreAiRouter } from './modules/ai/ai.router.js';

// ── E2.10: Help Assistant ─────────────────────────────────────────────────────

export {
  registerHelpProduct,
  resolveArticle,
  listArticles,
  getArticle,
  getHelpTooltips,
  handleHelpChat,
} from './modules/help/help.service.js';

export { default as coreHelpRouter } from './modules/help/help.router.js';
