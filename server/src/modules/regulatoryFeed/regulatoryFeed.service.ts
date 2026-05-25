import prisma from '../../lib/prisma.js';
import { Prisma } from '../../generated/prisma-client/index.js';
import type {
  CoreFeedSource,
  CoreFeedItem,
  CoreTenantFeedNotification,
  FeedReviewStatus,
  FeedIngestParams,
  FeedReviewParams,
} from '@wings2i-gracie/contracts';

// ── List Feed Sources ─────────────────────────────────────────────────────────

export async function listFeedSources(includeInactive = false): Promise<CoreFeedSource[]> {
  const rows = await prisma.coreFeedSource.findMany({
    where: {
      deleted_at: null,
      ...(includeInactive ? {} : { is_active: true }),
    },
    orderBy: { name: 'asc' },
  });

  return rows.map(mapSource);
}

// ── Register Feed Source ──────────────────────────────────────────────────────

export async function registerFeedSource(params: {
  name: string;
  url: string;
  scrapeSchedule?: string;
  parseRules?: Record<string, unknown>;
  isActive?: boolean;
}): Promise<CoreFeedSource> {
  const row = await prisma.coreFeedSource.create({
    data: {
      name: params.name,
      url: params.url,
      scrape_schedule: params.scrapeSchedule ?? null,
      parse_rules: params.parseRules ? (params.parseRules as object) : Prisma.DbNull,
      is_active: params.isActive ?? true,
    },
  });

  return mapSource(row);
}

// ── Update Feed Source ────────────────────────────────────────────────────────

export async function updateFeedSource(
  id: string,
  params: {
    name?: string;
    url?: string;
    scrapeSchedule?: string | null;
    parseRules?: Record<string, unknown> | null;
    isActive?: boolean;
  },
): Promise<CoreFeedSource> {
  const data: Record<string, unknown> = {};
  if (params.name !== undefined) data.name = params.name;
  if (params.url !== undefined) data.url = params.url;
  if (params.scrapeSchedule !== undefined) data.scrape_schedule = params.scrapeSchedule;
  if (params.parseRules !== undefined) data.parse_rules = params.parseRules ? (params.parseRules as object) : Prisma.DbNull;
  if (params.isActive !== undefined) data.is_active = params.isActive;

  const row = await prisma.coreFeedSource.update({
    where: { id },
    data,
  });

  return mapSource(row);
}

// ── Delete Feed Source (soft) ─────────────────────────────────────────────────

export async function deleteFeedSource(id: string): Promise<void> {
  await prisma.coreFeedSource.update({
    where: { id },
    data: { deleted_at: new Date(), is_active: false },
  });
}

// ── Ingest Feed Items ─────────────────────────────────────────────────────────

export async function ingestFeedItems(
  sourceId: string,
  items: FeedIngestParams[],
): Promise<{ created: number }> {
  const validItems = items.filter((i) => i.externalId);

  if (validItems.length === 0) return { created: 0 };

  const result = await prisma.coreFeedItem.createMany({
    data: validItems.map((item) => ({
      source_id: sourceId,
      external_id: item.externalId,
      title: item.title,
      summary: item.summary ?? null,
      url: item.url ?? null,
      published_at: item.publishedAt ? new Date(item.publishedAt) : null,
      raw_payload: item.rawPayload ? (item.rawPayload as object) : Prisma.DbNull,
      review_status: 'pending' as const,
    })),
    skipDuplicates: true,
  });

  return { created: result.count };
}

// ── List Feed Items ───────────────────────────────────────────────────────────

export interface ListFeedItemsFilter {
  reviewStatus?: FeedReviewStatus;
  sourceId?: string;
  regulationCode?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listFeedItems(filters?: ListFeedItemsFilter): Promise<{
  items: CoreFeedItem[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = filters?.page ?? 1;
  const pageSize = filters?.pageSize ?? 25;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {};
  if (filters?.reviewStatus) where.review_status = filters.reviewStatus;
  if (filters?.sourceId) where.source_id = filters.sourceId;
  if (filters?.regulationCode) where.regulation_code = filters.regulationCode;
  if (filters?.search) {
    where.OR = [
      { title: { contains: filters.search, mode: 'insensitive' } },
      { summary: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.coreFeedItem.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { created_at: 'desc' },
    }),
    prisma.coreFeedItem.count({ where }),
  ]);

  return { items: rows.map(mapItem), total, page, pageSize };
}

// ── Get Feed Item ─────────────────────────────────────────────────────────────

export async function getFeedItem(id: string): Promise<CoreFeedItem> {
  const row = await prisma.coreFeedItem.findUniqueOrThrow({ where: { id } });
  return mapItem(row);
}

// ── Review Feed Item ──────────────────────────────────────────────────────────

export async function reviewFeedItem(
  id: string,
  superAdminUserId: string,
  params: FeedReviewParams,
): Promise<CoreFeedItem> {
  const now = new Date();

  const statusMap: Record<FeedReviewParams['action'], FeedReviewStatus> = {
    approve: 'approved',
    reject: 'rejected',
    map: 'mapped',
  };

  const data: Record<string, unknown> = {
    review_status: statusMap[params.action],
    reviewed_by: superAdminUserId,
    reviewed_at: now,
  };

  if (params.action === 'map' && params.regulationCode) {
    data.regulation_code = params.regulationCode;
  }

  const row = await prisma.coreFeedItem.update({ where: { id }, data });

  if (params.action === 'approve' || params.action === 'map') {
    const regulationCode = params.action === 'map' ? params.regulationCode : row.regulation_code ?? undefined;
    await notifyTenantsOfFeedItem(id, regulationCode ?? undefined).catch(() => {
      // fire-and-forget — notification failure must not fail the review action
    });
  }

  return mapItem(row);
}

// ── Notify Tenants of Feed Item ───────────────────────────────────────────────

export async function notifyTenantsOfFeedItem(
  feedItemId: string,
  regulationCode?: string,
): Promise<number> {
  let tenantIds: string[] = [];

  if (regulationCode) {
    // Find tenants that have this regulation enabled via core_tenant_regulation_toggles
    const toggles = await prisma.coreTenantRegulationToggle.findMany({
      where: {
        is_enabled: true,
        regulation: { code: regulationCode },
      },
      select: { tenant_id: true },
    });
    tenantIds = toggles.map((t) => t.tenant_id);
  }

  if (tenantIds.length === 0) {
    // Fall back to all non-archived active tenants
    const tenants = await prisma.coreTenant.findMany({
      where: { archived_at: null },
      select: { id: true },
    });
    tenantIds = tenants.map((t) => t.id);
  }

  if (tenantIds.length === 0) return 0;

  const notificationType = regulationCode ? 'regulation_update' : 'new_item';

  await prisma.coreTenantFeedNotification.createMany({
    data: tenantIds.map((tid) => ({
      tenant_id: tid,
      feed_item_id: feedItemId,
      notification_type: notificationType,
    })),
    skipDuplicates: true,
  });

  return tenantIds.length;
}

// ── Get Tenant Notifications ──────────────────────────────────────────────────

export async function getTenantNotifications(
  tenantId: string,
  unreadOnly = false,
): Promise<CoreTenantFeedNotification[]> {
  const rows = await prisma.coreTenantFeedNotification.findMany({
    where: {
      tenant_id: tenantId,
      ...(unreadOnly ? { read_at: null } : {}),
    },
    orderBy: { notified_at: 'desc' },
    take: 100,
  });

  return rows.map(mapNotification);
}

// ── Mark Notification Read ────────────────────────────────────────────────────

export async function markNotificationRead(
  tenantId: string,
  notificationId: string,
): Promise<CoreTenantFeedNotification> {
  const row = await prisma.coreTenantFeedNotification.updateMany({
    where: { id: notificationId, tenant_id: tenantId, read_at: null },
    data: { read_at: new Date() },
  });

  if (row.count === 0) {
    // Already read or not found — return current state
    const existing = await prisma.coreTenantFeedNotification.findFirstOrThrow({
      where: { id: notificationId, tenant_id: tenantId },
    });
    return mapNotification(existing);
  }

  const updated = await prisma.coreTenantFeedNotification.findUniqueOrThrow({
    where: { id: notificationId },
  });
  return mapNotification(updated);
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapSource(r: {
  id: string;
  name: string;
  url: string;
  scrape_schedule: string | null;
  parse_rules: unknown;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}): CoreFeedSource {
  return {
    id: r.id,
    name: r.name,
    url: r.url,
    scrapeSchedule: r.scrape_schedule,
    parseRules: r.parse_rules ? (r.parse_rules as Record<string, unknown>) : null,
    isActive: r.is_active,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    deletedAt: r.deleted_at ? r.deleted_at.toISOString() : null,
  };
}

function mapItem(r: {
  id: string;
  source_id: string | null;
  external_id: string | null;
  title: string;
  summary: string | null;
  url: string | null;
  published_at: Date | null;
  raw_payload: unknown;
  review_status: string;
  regulation_code: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}): CoreFeedItem {
  return {
    id: r.id,
    sourceId: r.source_id,
    externalId: r.external_id,
    title: r.title,
    summary: r.summary,
    url: r.url,
    publishedAt: r.published_at ? r.published_at.toISOString() : null,
    rawPayload: r.raw_payload ? (r.raw_payload as Record<string, unknown>) : null,
    reviewStatus: r.review_status as FeedReviewStatus,
    regulationCode: r.regulation_code,
    reviewedBy: r.reviewed_by,
    reviewedAt: r.reviewed_at ? r.reviewed_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

function mapNotification(r: {
  id: string;
  tenant_id: string;
  feed_item_id: string;
  notification_type: string;
  notified_at: Date;
  read_at: Date | null;
}): CoreTenantFeedNotification {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    feedItemId: r.feed_item_id,
    notificationType: r.notification_type as 'new_item' | 'regulation_update',
    notifiedAt: r.notified_at.toISOString(),
    readAt: r.read_at ? r.read_at.toISOString() : null,
  };
}
