// E2.18: App Shell registry — in-memory product registration store.
// Products call registerProduct() at startup; the shell router serves
// sidebar and module configs to the client.

import type {
  ProductRegistration,
  SidebarGroup,
  ModuleRegistration,
} from '@wings2i-gracie/contracts';

const registry = new Map<string, ProductRegistration>();

export function registerProduct(registration: ProductRegistration): void {
  registry.set(registration.productKey, registration);
}

export function getProduct(productKey: string): ProductRegistration | undefined {
  return registry.get(productKey);
}

export function listProducts(): ProductRegistration[] {
  return Array.from(registry.values());
}

export function getSidebar(productKey: string): SidebarGroup[] {
  return registry.get(productKey)?.sidebar ?? [];
}

export function getModules(productKey: string): ModuleRegistration[] {
  return registry.get(productKey)?.modules ?? [];
}
