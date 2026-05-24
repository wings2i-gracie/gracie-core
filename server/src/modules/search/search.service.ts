import prisma from '../../lib/prisma.js';

export interface SearchIndexEntry {
  moduleKey: string;
  recordId: string;
  title: string;
  body?: string;
  url?: string;
  tags?: string[];
}

export interface SearchResult {
  moduleKey: string;
  recordId: string;
  title: string;
  body?: string;
  url?: string;
  score?: number;
}

export async function upsertSearchIndex(tenantId: string, entry: SearchIndexEntry): Promise<void> {
  try {
    await prisma.coreSearchIndex.upsert({
      where: {
        tenant_id_module_key_record_id: {
          tenant_id: tenantId,
          module_key: entry.moduleKey,
          record_id: entry.recordId,
        },
      },
      update: {
        title: entry.title,
        body: entry.body ?? null,
        url: entry.url ?? null,
        tags: entry.tags ?? [],
        deleted_at: null,
        updated_at: new Date(),
      },
      create: {
        tenant_id: tenantId,
        module_key: entry.moduleKey,
        record_id: entry.recordId,
        title: entry.title,
        body: entry.body ?? null,
        url: entry.url ?? null,
        tags: entry.tags ?? [],
      },
    });
  } catch (err) {
    console.error('[core/searchIndex.upsert] Failed:', err);
  }
}

export async function deleteSearchIndex(tenantId: string, moduleKey: string, recordId: string): Promise<void> {
  try {
    await prisma.coreSearchIndex.updateMany({
      where: {
        tenant_id: tenantId,
        module_key: moduleKey,
        record_id: recordId,
        deleted_at: null,
      },
      data: { deleted_at: new Date() },
    });
  } catch (err) {
    console.error('[core/searchIndex.delete] Failed:', err);
  }
}

export async function searchRecords(
  tenantId: string,
  query: string,
  modules?: string[],
): Promise<SearchResult[]> {
  if (!query || query.trim().length < 2) return [];

  const q = query.trim();

  const rows = await prisma.coreSearchIndex.findMany({
    where: {
      tenant_id: tenantId,
      deleted_at: null,
      ...(modules?.length ? { module_key: { in: modules } } : {}),
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { body:  { contains: q, mode: 'insensitive' } },
      ],
    },
    select: {
      module_key: true,
      record_id: true,
      title: true,
      body: true,
      url: true,
    },
    orderBy: { updated_at: 'desc' },
  });

  // Cap at 5 results per module
  const seen = new Map<string, number>();
  const results: SearchResult[] = [];

  for (const row of rows) {
    const count = seen.get(row.module_key) ?? 0;
    if (count >= 5) continue;
    seen.set(row.module_key, count + 1);
    results.push({
      moduleKey: row.module_key,
      recordId: row.record_id,
      title: row.title,
      body: row.body ?? undefined,
      url: row.url ?? undefined,
    });
  }

  return results;
}

export async function reindexModule(
  tenantId: string,
  moduleKey: string,
  entries: SearchIndexEntry[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.coreSearchIndex.deleteMany({
      where: { tenant_id: tenantId, module_key: moduleKey },
    });

    if (entries.length === 0) return;

    await tx.coreSearchIndex.createMany({
      data: entries.map((e) => ({
        tenant_id: tenantId,
        module_key: moduleKey,
        record_id: e.recordId,
        title: e.title,
        body: e.body ?? null,
        url: e.url ?? null,
        tags: e.tags ?? [],
      })),
      skipDuplicates: true,
    });
  });
}
