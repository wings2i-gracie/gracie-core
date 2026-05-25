// E2.15b: Integration audit log — append-only record of API key and OAuth authenticated requests.

import prisma from '../../lib/prisma.js';
import type { CoreIntegrationAuditEntry } from '@wings2i-gracie/contracts';

export function logIntegrationRequest(entry: CoreIntegrationAuditEntry): void {
  // Fire-and-forget — never block the request path
  void prisma.coreIntegrationAudit
    .create({
      data: {
        tenant_id: entry.tenantId,
        actor_type: entry.actorType,
        actor_id: entry.actorId,
        action: entry.action,
        resource_type: entry.resourceType ?? null,
        resource_id: entry.resourceId ?? null,
        status_code: entry.statusCode ?? null,
        ip_address: entry.ipAddress ?? null,
      },
    })
    .catch((err) => {
      console.warn('[core/integrationAudit] Failed to write audit entry:', err);
    });
}

export interface AuditFilters {
  actorType?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export async function getIntegrationAudit(
  tenantId: string,
  filters: AuditFilters = {},
) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 50));
  const skip = (page - 1) * pageSize;

  const where = {
    tenant_id: tenantId,
    ...(filters.actorType ? { actor_type: filters.actorType } : {}),
    ...(filters.from || filters.to
      ? {
          created_at: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };

  const [entries, total] = await Promise.all([
    prisma.coreIntegrationAudit.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.coreIntegrationAudit.count({ where }),
  ]);

  return {
    data: entries.map((e) => ({
      id: e.id,
      tenantId: e.tenant_id,
      actorType: e.actor_type,
      actorId: e.actor_id,
      action: e.action,
      resourceType: e.resource_type ?? undefined,
      resourceId: e.resource_id ?? undefined,
      statusCode: e.status_code ?? undefined,
      ipAddress: e.ip_address ?? undefined,
      createdAt: e.created_at.toISOString(),
    })),
    meta: { page, pageSize, total },
  };
}
