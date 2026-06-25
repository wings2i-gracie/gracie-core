import { type AuditLogParams } from '@wings2i-gracie/contracts';
import prisma from '../../lib/prisma.js';

export { type AuditLogParams };

// RFC-4122 UUID shape (any version). Audit actor must be a real core_users.id;
// the legacy `userId: 'system'` / empty-string actors are NOT valid here.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function auditLog(params: AuditLogParams): Promise<void> {
  // F1/F2: malformed actor is a programming/wiring error, NOT a transient DB
  // fault — fail LOUD and distinct so it can never be silently swallowed again
  // (the old behaviour: a non-UUID actor reached Postgres, was rejected as
  // 22P02, and got eaten by the generic catch → action went unrecorded).
  if (typeof params.userId !== 'string' || !UUID_RE.test(params.userId)) {
    console.error(
      `[auditLog] INVALID ACTOR — write rejected. userId=${JSON.stringify(
        params.userId,
      )} action=${params.action} module=${params.module}. ` +
        'Automated/cron callers must pass SYSTEM_ACTOR_USER_ID.',
    );
    throw new Error(
      `[auditLog] INVALID ACTOR: userId must be a valid UUID, got ${JSON.stringify(
        params.userId,
      )}`,
    );
  }

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
        actor_name: params.actorName ?? null,
        actor_email: params.actorEmail ?? null,
        actor_role: params.actorRole ?? null,
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
    ...logs.map(l => {
      // F1: user can now be null (FK SetNull after a hard-delete) — fall back to the
      // snapshotted actor identity captured at write time so the export never NPEs and
      // attribution is preserved.
      const name = l.user
        ? `${l.user.first_name} ${l.user.last_name}`
        : l.actor_name ?? 'System';
      const email = l.user ? l.user.email : l.actor_email ?? '';
      return [
        l.created_at.toISOString(),
        name,
        email,
        l.action,
        l.module,
        l.record_id ?? '',
      ].map(v => `"${v}"`).join(',');
    }),
  ].join('\n');
}
