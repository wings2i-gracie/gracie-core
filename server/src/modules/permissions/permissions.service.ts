import type { PermissionsRegistration } from '@wings2i-gracie/contracts';
import prisma from '../../lib/prisma.js';

// ── In-memory module registry ─────────────────────────────────────────────────
// Populated at product startup via registerModules(). O(1) lookup per request.

const moduleRegistry = new Map<string, string>(); // moduleKey → productKey

/**
 * Phase B — runtime registration (synchronous, in-memory).
 * Call at every server boot, after Phase A (upsertModuleRegistry).
 */
export function registerModules(registration: PermissionsRegistration): void {
  for (const mod of registration.modules) {
    moduleRegistry.set(mod.moduleKey, registration.productKey);
  }
  console.log(
    `[Permissions] Registered ${registration.modules.length} modules for product '${registration.productKey}'`,
  );
}

/**
 * Phase A — DB registration (idempotent, async).
 * Writes module metadata to core_module_registry. Safe to re-run on every boot.
 */
export async function upsertModuleRegistry(registration: PermissionsRegistration): Promise<void> {
  for (const mod of registration.modules) {
    await prisma.coreModuleRegistry.upsert({
      where: {
        product_key_module_key: {
          product_key: registration.productKey,
          module_key: mod.moduleKey,
        },
      },
      create: {
        product_key: registration.productKey,
        module_key: mod.moduleKey,
        label: mod.label,
        sort_order: mod.sortOrder ?? 0,
      },
      update: {
        label: mod.label,
        sort_order: mod.sortOrder ?? 0,
      },
    });
  }
}

/** Returns true if the module key has been registered via registerModules(). */
export function isModuleRegistered(moduleKey: string): boolean {
  return moduleRegistry.has(moduleKey);
}

/** Returns all registered module keys across all products. */
export function getRegisteredModuleKeys(): string[] {
  return Array.from(moduleRegistry.keys());
}
