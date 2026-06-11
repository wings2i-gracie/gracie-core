// Role registry — products call registerRole() at startup to declare
// permission-bearing roles beyond the 8 Core roles. Core's 8 roles are
// pre-seeded so isKnownRole() and getAllRoleKeys() cover everything.

export interface RoleRegistration {
  roleKey: string;
  label: string;
  productKey: string;
  /** Per-module defaults for this role. Absent module keys default to no access. */
  defaultPermissions?: Record<string, { access: boolean; edit: boolean }>;
  /** Whether this role appears in the Permissions Matrix UI. Default: true. */
  configurable?: boolean;
  /** Whether this role appears in the Notification Preferences matrix. Default: true. */
  notifiable?: boolean;
}

const CORE_ROLES: RoleRegistration[] = [
  { roleKey: 'super_admin',        label: 'Super Admin',        productKey: 'core', configurable: false, notifiable: false },
  { roleKey: 'org_admin',          label: 'Org Admin',          productKey: 'core', configurable: false, notifiable: true  },
  { roleKey: 'compliance_manager', label: 'Compliance Manager', productKey: 'core', configurable: true,  notifiable: true  },
  { roleKey: 'leadership',         label: 'Leadership',         productKey: 'core', configurable: true,  notifiable: true  },
  { roleKey: 'function_owner',     label: 'Function Owner',     productKey: 'core', configurable: true,  notifiable: true  },
  { roleKey: 'context_owner',      label: 'Context Owner',      productKey: 'core', configurable: true,  notifiable: true  },
  { roleKey: 'auditor',            label: 'Auditor',            productKey: 'core', configurable: true,  notifiable: true  },
  { roleKey: 'viewer',             label: 'Viewer',             productKey: 'core', configurable: true,  notifiable: false },
];

const roleRegistry = new Map<string, RoleRegistration>(
  CORE_ROLES.map(r => [r.roleKey, r]),
);

/**
 * Register a product-specific role. Call at server startup (before handling requests).
 * Core's 8 roles are pre-registered; calling this for a Core role key is a no-op
 * unless you explicitly want to override its label/defaults.
 */
export function registerRole(registration: RoleRegistration): void {
  roleRegistry.set(registration.roleKey, registration);
  console.log(
    `[RoleRegistry] Registered role '${registration.roleKey}' for product '${registration.productKey}'`,
  );
}

export function getRegisteredRole(roleKey: string): RoleRegistration | undefined {
  return roleRegistry.get(roleKey);
}

export function listRegisteredRoles(): RoleRegistration[] {
  return Array.from(roleRegistry.values());
}

/** All known role keys (Core + all product-registered). */
export function getAllRoleKeys(): string[] {
  return Array.from(roleRegistry.keys());
}

/** True if the role key is known to the registry (safe allow-list check). */
export function isKnownRole(roleKey: string): boolean {
  return roleRegistry.has(roleKey);
}

/** Role keys that should appear in the Permissions Matrix UI (excludes super_admin / org_admin). */
export function getConfigurableRoleKeys(): string[] {
  return Array.from(roleRegistry.values())
    .filter(r => r.configurable !== false)
    .map(r => r.roleKey);
}

/** Role keys that should appear in the Notification Preferences matrix. */
export function getNotifiableRoleKeys(): string[] {
  return Array.from(roleRegistry.values())
    .filter(r => r.notifiable !== false)
    .map(r => r.roleKey);
}
