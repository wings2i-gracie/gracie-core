import { type AuditLogParams } from '@wings2i-gracie/contracts';
import prisma from '../../lib/prisma.js';

export { type AuditLogParams };

export async function auditLog(params: AuditLogParams): Promise<void> {
  try {
    await prisma.coreAuditLog.create({
      data: {
        user_id: params.userId,
        tenant_id: params.tenantId ?? null,
        organisation_id: params.organisationId ?? null,
        action: params.action,
        module: params.module,
        record_id: params.recordId ?? null,
        record_type: params.recordType ?? null,
        before_state: params.before ?? undefined,
        after_state: params.after ?? undefined,
        ip_address: params.ipAddress ?? null,
      },
    });
  } catch (err) {
    console.error('[auditLog] Failed to write audit log:', err);
  }
}

export async function getAuditLogs(
  tenantId: string,
  filters: { module?: string; userId?: string; from?: string; to?: string },
  pagination: { page: number; pageSize: number },
) {
  const { page, pageSize } = pagination;

  const where = {
    tenant_id: tenantId,
    ...(filters.module ? { module: filters.module } : {}),
    ...(filters.userId ? { user_id: filters.userId } : {}),
    ...(filters.from || filters.to ? {
      created_at: {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      },
    } : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.coreAuditLog.findMany({
      where,
      include: { user: { select: { first_name: true, last_name: true, email: true } } },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.coreAuditLog.count({ where }),
  ]);

  return { logs, total, page, pageSize };
}

export async function exportAuditLogsAsCsv(
  tenantId: string,
  filters: { module?: string; userId?: string; from?: string; to?: string },
): Promise<string> {
  const where = {
    tenant_id: tenantId,
    ...(filters.module ? { module: filters.module } : {}),
    ...(filters.userId ? { user_id: filters.userId } : {}),
    ...(filters.from || filters.to ? {
      created_at: {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      },
    } : {}),
  };

  const logs = await prisma.coreAuditLog.findMany({
    where,
    include: { user: { select: { first_name: true, last_name: true, email: true } } },
    orderBy: { created_at: 'desc' },
    take: 5000,
  });

  return [
    'Date,User,Email,Action,Module,Record ID',
    ...logs.map(l =>
      [
        l.created_at.toISOString(),
        `${l.user.first_name} ${l.user.last_name}`,
        l.user.email,
        l.action,
        l.module,
        l.record_id ?? '',
      ].map(v => `"${v}"`).join(','),
    ),
  ].join('\n');
}
