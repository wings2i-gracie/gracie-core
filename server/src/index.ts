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
  createTenantFramework as coreCreateTenantFramework,
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

// ── E2.11: Global Search ──────────────────────────────────────────────────────

export {
  upsertSearchIndex,
  deleteSearchIndex,
  searchRecords,
  reindexModule,
  type SearchIndexEntry,
  type SearchResult,
} from './modules/search/search.service.js';

export { default as coreSearchRouter } from './modules/search/search.router.js';

// ── E2.14: Reporting Engine ───────────────────────────────────────────────────

export {
  registerReportTemplates,
  getRegisteredTemplates,
  listReportRuns,
  getReportRun,
  createReportRunRecord,
  softDeleteReportRun,
  shareReportRun,
  createPendingReportRun,
  finaliseReportRun,
  getReportRunStatus,
  listSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  markScheduleRan,
  getDueSchedules,
  type CreateReportRunInput,
  type CreateScheduleInput,
  type ReportingRegistration,
  type ReportingTemplateSpec,
} from './modules/reporting/reporting.service.js';

export { default as coreReportingRouter } from './modules/reporting/reporting.router.js';

// ── E2.15a: Integration Framework (API Keys + Webhooks) ───────────────────────

export {
  generateApiKey,
  listApiKeys,
  revokeApiKey,
  validateApiKey,
  registerWebhookEvents,
  getWebhookEvents,
  createSubscription,
  listSubscriptions,
  deleteSubscription,
  listDeliveries,
  dispatchWebhook,
  retryFailedDeliveries,
} from './modules/integration/integration.service.js';

export { default as coreIntegrationsRouter } from './modules/integration/integration.router.js';

// ── E2.15b: OAuth, Event Bus, Rate Limiting, Idempotency, OpenAPI, Audit ──────

export {
  createOAuthClient,
  listOAuthClients,
  revokeOAuthClient,
  issueClientCredentialsToken,
  validateOAuthToken,
} from './modules/integration/oauth.service.js';

export { eventBus } from './modules/integration/eventBus.js';

export { rateLimitByApiKey, rateLimitByOAuthClient } from './modules/integration/rateLimiter.middleware.js';

export { requireIdempotency } from './modules/integration/idempotency.middleware.js';

export { registerOpenApiFragment, getComposedSpec } from './modules/integration/openapi.service.js';

export {
  logIntegrationRequest,
  getIntegrationAudit,
  type AuditFilters,
} from './modules/integration/integrationAudit.service.js';

// ── E2.16: Tenant Management + License Management ─────────────────────────────

export {
  listTenants,
  getTenant,
  createTenant,
  suspendTenant,
  reactivateTenant,
  archiveTenant,
  assignLicense,
  revokeLicense,
  getLicenses,
  issueSupportModeToken,
  exitSupportMode,
  type ListTenantsFilter,
  type ListTenantsResult,
  type SupportModeResult,
} from './modules/tenantMgmt/tenantMgmt.service.js';

export { default as coreSuperAdminRouter } from './modules/tenantMgmt/tenantMgmt.router.js';

// ── E2.17: Regulatory Feed Curation ───────────────────────────────────────────

export {
  registerFeedSource,
  listFeedSources,
  updateFeedSource,
  deleteFeedSource,
  ingestFeedItems,
  listFeedItems,
  getFeedItem,
  reviewFeedItem,
  notifyTenantsOfFeedItem,
  getTenantNotifications,
  markNotificationRead,
  type ListFeedItemsFilter,
} from './modules/regulatoryFeed/regulatoryFeed.service.js';

export { default as coreRegulatoryFeedRouter } from './modules/regulatoryFeed/regulatoryFeed.router.js';

// ── E2.18: App Shell Registry ─────────────────────────────────────────────────

export {
  registerProduct,
  getProduct,
  listProducts,
  getSidebar,
  getModules,
} from './modules/shellRegistry/shellRegistry.service.js';

export { default as shellRegistryRouter } from './modules/shellRegistry/shellRegistry.router.js';

// ── Seq 4a: Role Registry ─────────────────────────────────────────────────────

export {
  registerRole,
  getRegisteredRole,
  listRegisteredRoles,
  getAllRoleKeys,
  isKnownRole,
  getConfigurableRoleKeys,
  getNotifiableRoleKeys,
  type RoleRegistration,
} from './modules/roles/roleRegistry.service.js';

export { default as coreRoleRegistryRouter } from './modules/roles/roleRegistry.router.js';

// ── Seq 4c-0: User×Function Ownership Grant (shared resolver) ─────────────────

export {
  resolveOwnedFunctionIds,
  resolveFunctionScope,
  grantFunctionToUser,
  revokeFunctionGrant,
  listFunctionGrants,
} from './modules/userFunctionGrant/userFunctionGrant.service.js';

export { default as coreUserFunctionGrantRouter } from './modules/userFunctionGrant/userFunctionGrant.router.js';

// ── 1a: Jurisdiction Directory ────────────────────────────────────────────────

export {
  listJurisdictionActs,
  getJurisdictionAct,
  createJurisdictionAct as coreCreateJurisdictionAct,
  updateJurisdictionAct as coreUpdateJurisdictionAct,
  addJurisdictionRegion as coreAddJurisdictionRegion,
  updateJurisdictionRegion as coreUpdateJurisdictionRegion,
  removeJurisdictionRegion as coreRemoveJurisdictionRegion,
  type JurisdictionAct,
  type JurisdictionActRegion,
} from './modules/jurisdiction/jurisdiction.service.js';
