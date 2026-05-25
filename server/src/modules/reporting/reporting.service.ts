// E2.14: Reporting engine — framework layer for GRACie product suite.
// Manages template registry (in-memory + DB), report runs, and scheduled reports.
// Privacy-specific data fetchers and custom template CRUD remain in Privacy.

import prisma from '../../lib/prisma.js';
import type { ReportingTemplateSpec, ReportingRegistration } from '@wings2i-gracie/contracts';

// ─── In-memory template registry ─────────────────────────────────────────────

const templateRegistry = new Map<string, ReportingTemplateSpec[]>();

export function registerReportTemplates(productKey: string, templates: ReportingTemplateSpec[]): void {
  templateRegistry.set(productKey, templates);
  persistReportTemplates(productKey, templates).catch((err: unknown) =>
    console.warn(`[core/reporting] persistReportTemplates failed for ${productKey}:`, err),
  );
}

export function getRegisteredTemplates(productKey?: string): Array<ReportingTemplateSpec & { productKey: string }> {
  if (productKey) {
    const templates = templateRegistry.get(productKey) ?? [];
    return templates.map((t) => ({ ...t, productKey }));
  }
  const all: Array<ReportingTemplateSpec & { productKey: string }> = [];
  for (const [pk, templates] of templateRegistry.entries()) {
    for (const t of templates) {
      all.push({ ...t, productKey: pk });
    }
  }
  return all;
}

async function persistReportTemplates(productKey: string, templates: ReportingTemplateSpec[]): Promise<void> {
  for (const tpl of templates) {
    await prisma.coreReportTemplate.upsert({
      where: { product_key_template_key: { product_key: productKey, template_key: tpl.templateKey } },
      create: {
        product_key: productKey,
        template_key: tpl.templateKey,
        name: tpl.name,
        description: tpl.description,
        report_type_key: tpl.reportTypeKey,
        supported_formats: tpl.supportedFormats ?? ['pdf', 'excel', 'csv', 'html'],
        default_format: tpl.defaultFormat ?? 'pdf',
        sort_order: tpl.sortOrder ?? 0,
      },
      update: {
        name: tpl.name,
        description: tpl.description,
        report_type_key: tpl.reportTypeKey,
        supported_formats: tpl.supportedFormats ?? ['pdf', 'excel', 'csv', 'html'],
        default_format: tpl.defaultFormat ?? 'pdf',
        sort_order: tpl.sortOrder ?? 0,
        is_active: true,
        updated_at: new Date(),
      },
    });
  }
}

// ─── Input types ──────────────────────────────────────────────────────────────

export interface CreateReportRunInput {
  tenantId: string;
  organisationId?: string;
  generatedBy: string;
  reportType: string;
  title: string;
  scope: Record<string, unknown>;
  format: string;
}

export interface CreateScheduleInput {
  tenantId: string;
  createdBy: string;
  reportType: string;
  title: string;
  scope: Record<string, unknown>;
  format: string;
  frequency: string;
  recipients: string[];
}

// ─── Report run helpers ───────────────────────────────────────────────────────

export async function listReportRuns(tenantId: string, page = 1, pageSize = 25) {
  const skip = (page - 1) * pageSize;
  const where = { tenant_id: tenantId, deleted_at: null };
  const [total, runs] = await Promise.all([
    prisma.coreReportRun.count({ where }),
    prisma.coreReportRun.findMany({
      where,
      orderBy: { generated_at: 'desc' },
      skip,
      take: pageSize,
    }),
  ]);
  return {
    runs: runs.map(mapRun),
    meta: { page, pageSize, total },
  };
}

export async function getReportRun(tenantId: string, runId: string) {
  const run = await prisma.coreReportRun.findFirst({
    where: { id: runId, tenant_id: tenantId, deleted_at: null },
  });
  if (!run) return null;
  return mapRun(run);
}

export async function createReportRunRecord(
  input: CreateReportRunInput,
  fileRef: string | null,
  fileSizeBytes: number | null,
) {
  const run = await prisma.coreReportRun.create({
    data: {
      tenant_id: input.tenantId,
      report_type: input.reportType,
      title: input.title,
      scope: input.scope as object,
      generated_by: input.generatedBy,
      format: input.format,
      file_ref: fileRef ?? undefined,
      file_size_bytes: fileSizeBytes ?? undefined,
    },
  });
  return mapRun(run);
}

export async function softDeleteReportRun(tenantId: string, runId: string): Promise<void> {
  await prisma.coreReportRun.updateMany({
    where: { id: runId, tenant_id: tenantId, deleted_at: null },
    data: { deleted_at: new Date() },
  });
}

export async function shareReportRun(tenantId: string, runId: string, userIds: string[]) {
  const run = await prisma.coreReportRun.findFirst({
    where: { id: runId, tenant_id: tenantId, deleted_at: null },
  });
  if (!run) return null;
  const existing = (run.shared_with as string[] | null) ?? [];
  const merged = Array.from(new Set([...existing, ...userIds]));
  return prisma.coreReportRun.update({
    where: { id: runId },
    data: { shared_with: merged },
  });
}

export async function createPendingReportRun(input: CreateReportRunInput): Promise<string> {
  const run = await prisma.coreReportRun.create({
    data: {
      tenant_id: input.tenantId,
      report_type: input.reportType,
      title: input.title,
      scope: input.scope as object,
      generated_by: input.generatedBy,
      format: input.format,
      status: 'generating',
    },
  });
  return run.id;
}

export async function finaliseReportRun(
  runId: string,
  fileRef: string | null,
  fileSizeBytes: number | null,
  success: boolean,
): Promise<void> {
  await prisma.coreReportRun.update({
    where: { id: runId },
    data: {
      file_ref: fileRef ?? undefined,
      file_size_bytes: fileSizeBytes ?? undefined,
      status: success ? 'ready' : 'failed',
    },
  });
}

export async function getReportRunStatus(tenantId: string, runId: string) {
  const run = await prisma.coreReportRun.findFirst({
    where: { id: runId, tenant_id: tenantId, deleted_at: null },
    select: { id: true, status: true, file_ref: true },
  });
  if (!run) return null;
  return { status: run.status, fileRef: run.file_ref };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRun(r: any) {
  return {
    id: r.id,
    reportType: r.report_type,
    title: r.title,
    scope: r.scope,
    format: r.format,
    fileRef: r.file_ref ?? null,
    fileSizeBytes: r.file_size_bytes ?? null,
    sharedWith: (r.shared_with as string[] | null) ?? [],
    generatedAt: (r.generated_at as Date).toISOString(),
    status: r.status,
    generator: null,
  };
}

// ─── Schedule helpers ─────────────────────────────────────────────────────────

export async function listSchedules(tenantId: string) {
  const schedules = await prisma.coreScheduledReport.findMany({
    where: { tenant_id: tenantId, deleted_at: null },
    orderBy: { created_at: 'desc' },
  });
  return schedules.map(mapSchedule);
}

export async function createSchedule(input: CreateScheduleInput) {
  const nextRun = computeNextRun(input.frequency);
  const schedule = await prisma.coreScheduledReport.create({
    data: {
      tenant_id: input.tenantId,
      report_type: input.reportType,
      title: input.title,
      scope: input.scope as object,
      format: input.format,
      frequency: input.frequency,
      next_run: nextRun,
      recipients: input.recipients as object,
      created_by: input.createdBy,
    },
  });
  return mapSchedule(schedule);
}

export async function updateSchedule(
  tenantId: string,
  scheduleId: string,
  updates: Partial<{ isActive: boolean; frequency: string; recipients: string[]; format: string }>,
) {
  const data: Record<string, unknown> = {};
  if (updates.isActive !== undefined) data.is_active = updates.isActive;
  if (updates.frequency) {
    data.frequency = updates.frequency;
    data.next_run = computeNextRun(updates.frequency);
  }
  if (updates.recipients) data.recipients = updates.recipients;
  if (updates.format) data.format = updates.format;
  const schedule = await prisma.coreScheduledReport.update({
    where: { id: scheduleId },
    data,
  });
  if (schedule.tenant_id !== tenantId) throw new Error('Not found');
  return mapSchedule(schedule);
}

export async function deleteSchedule(tenantId: string, scheduleId: string): Promise<void> {
  await prisma.coreScheduledReport.updateMany({
    where: { id: scheduleId, tenant_id: tenantId },
    data: { deleted_at: new Date(), is_active: false },
  });
}

export async function markScheduleRan(scheduleId: string, frequency: string): Promise<void> {
  const nextRun = computeNextRun(frequency);
  await prisma.coreScheduledReport.update({
    where: { id: scheduleId },
    data: { last_run_at: new Date(), next_run: nextRun },
  });
}

export async function getDueSchedules() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return prisma.coreScheduledReport.findMany({
    where: {
      is_active: true,
      deleted_at: null,
      next_run: { lte: today },
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSchedule(s: any) {
  return {
    id: s.id,
    reportType: s.report_type,
    title: s.title,
    scope: s.scope,
    format: s.format,
    frequency: s.frequency,
    nextRun: s.next_run instanceof Date ? s.next_run.toISOString().split('T')[0] : String(s.next_run),
    lastRunAt: s.last_run_at ? (s.last_run_at as Date).toISOString() : null,
    recipients: s.recipients,
    isActive: s.is_active,
    createdAt: (s.created_at as Date).toISOString(),
    creator: null,
  };
}

function computeNextRun(frequency: string): Date {
  const d = new Date();
  switch (frequency) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() + 3);
      break;
  }
  return d;
}

// Re-export registration interface for consumers
export type { ReportingRegistration, ReportingTemplateSpec };
