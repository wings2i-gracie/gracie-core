// E2.7: Notifications engine extracted from Privacy. Reads/writes core_notifications table.
// Old Privacy notifications table is retained (strangler bridge — no drops).
import prisma from '../../lib/prisma.js';

export interface CreateNotificationParams {
  tenantId: string;
  organisationId: string;
  userId: string;
  eventType: string;
  title: string;
  body: string;
  recordRef?: string;
  recordModule?: string;
}

export interface ListNotificationsFilter {
  unreadOnly?: boolean;
  moduleKey?: string;
  page?: number;
  pageSize?: number;
}

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  try {
    await prisma.coreNotification.create({
      data: {
        tenant_id: params.tenantId,
        organisation_id: params.organisationId,
        user_id: params.userId,
        event_type: params.eventType,
        title: params.title,
        body: params.body,
        record_ref: params.recordRef ?? null,
        record_module: params.recordModule ?? null,
        is_read: false,
      },
    });
  } catch (err) {
    console.error('[createNotification] Failed to create notification:', err);
  }
}

// Backward-compat alias — matches the Privacy notificationDispatch signature exactly.
export { createNotification as notificationDispatch };

export async function getUnreadCount(tenantId: string, userId: string): Promise<number> {
  return prisma.coreNotification.count({
    where: { tenant_id: tenantId, user_id: userId, is_read: false, deleted_at: null },
  });
}

export async function listNotifications(
  tenantId: string,
  userId: string,
  filter: ListNotificationsFilter = {},
) {
  const { unreadOnly = false, moduleKey, page = 1, pageSize = 20 } = filter;
  const skip = (page - 1) * Math.min(pageSize, 50);
  const take = Math.min(pageSize, 50);

  const where: Record<string, unknown> = {
    tenant_id: tenantId,
    user_id: userId,
    deleted_at: null,
    ...(unreadOnly ? { is_read: false } : {}),
    ...(moduleKey ? { record_module: moduleKey } : {}),
  };

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.coreNotification.findMany({
      where,
      orderBy: [{ is_read: 'asc' }, { created_at: 'desc' }],
      skip,
      take,
      select: {
        id: true,
        event_type: true,
        title: true,
        body: true,
        record_ref: true,
        record_module: true,
        is_read: true,
        read_at: true,
        created_at: true,
      },
    }),
    prisma.coreNotification.count({ where }),
    prisma.coreNotification.count({
      where: { tenant_id: tenantId, user_id: userId, is_read: false, deleted_at: null },
    }),
  ]);

  return { notifications, total, unreadCount };
}

export async function markAsRead(
  id: string,
  tenantId: string,
  userId: string,
): Promise<{ found: boolean; forbidden: boolean; notification?: unknown }> {
  const notification = await prisma.coreNotification.findFirst({
    where: { id, tenant_id: tenantId, deleted_at: null },
  });
  if (!notification) return { found: false, forbidden: false };
  if (notification.user_id !== userId) return { found: true, forbidden: true };

  const updated = await prisma.coreNotification.update({
    where: { id },
    data: { is_read: true, read_at: new Date() },
  });
  return { found: true, forbidden: false, notification: updated };
}

export async function markAllAsRead(tenantId: string, userId: string): Promise<number> {
  const result = await prisma.coreNotification.updateMany({
    where: { tenant_id: tenantId, user_id: userId, is_read: false, deleted_at: null },
    data: { is_read: true, read_at: new Date() },
  });
  return result.count;
}

export async function deleteNotification(id: string, tenantId: string): Promise<boolean> {
  const notification = await prisma.coreNotification.findFirst({
    where: { id, tenant_id: tenantId, deleted_at: null },
  });
  if (!notification) return false;

  await prisma.coreNotification.update({
    where: { id },
    data: { deleted_at: new Date() },
  });
  return true;
}
