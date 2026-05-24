// E2.6: Tasks engine extracted from Privacy. Reads/writes core_tasks* tables.
// Privacy tasks/* tables are retained (strangler bridge — no drops).
import prisma from '../../lib/prisma.js';
import { CoreTaskStatus, CoreTaskPriority, CoreTaskSource, CoreTaskRecurrenceFrequency } from '../../generated/prisma-client/index.js';

export interface CreateTaskInput {
  tenantId: string;
  title: string;
  description?: string;
  priority?: CoreTaskPriority;
  source?: CoreTaskSource;
  sourceId?: string;
  sourceModule?: string;
  ownerId: string;
  functionId?: string;
  dueDate?: string;
  createdBy?: string;
}

export interface ListTasksFilter {
  tenantId: string;
  status?: string[];
  priority?: string[];
  source?: string[];
  ownerId?: string;
  functionId?: string;
  ownedOrCreatedByUserId?: string;
  dueBefore?: string;
  dueAfter?: string;
  search?: string;
  includeDeleted?: boolean;
  page?: number;
  pageSize?: number;
}

const TASK_INCLUDE = {
  owner: { select: { id: true, first_name: true, last_name: true, email: true } },
  creator: { select: { id: true, first_name: true, last_name: true } },
  function: { select: { id: true, name: true } },
  sub_tasks: { orderBy: { sort_order: 'asc' as const } },
  watchers: { include: { user: { select: { id: true, first_name: true, last_name: true } } } },
  recurrence: true,
} as const;

export async function createTask(input: CreateTaskInput) {
  return prisma.coreTask.create({
    data: {
      tenant_id: input.tenantId,
      title: input.title,
      description: input.description,
      priority: input.priority ?? 'medium',
      source: input.source ?? 'manual',
      source_id: input.sourceId ?? null,
      source_module: input.sourceModule ?? null,
      owner_id: input.ownerId,
      function_id: input.functionId ?? null,
      due_date: input.dueDate ? new Date(input.dueDate) : null,
      created_by: input.createdBy ?? null,
    },
    include: TASK_INCLUDE,
  });
}

export async function listTasks(filter: ListTasksFilter) {
  const { tenantId, page = 1, pageSize = 25 } = filter;
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {
    tenant_id: tenantId,
    deleted_at: null,
  };

  if (filter.status?.length) where.status = { in: filter.status as CoreTaskStatus[] };
  if (filter.priority?.length) where.priority = { in: filter.priority as CoreTaskPriority[] };
  if (filter.source?.length) where.source = { in: filter.source as CoreTaskSource[] };
  if (filter.ownerId) where.owner_id = filter.ownerId;
  if (filter.functionId) where.function_id = filter.functionId;
  if (filter.ownedOrCreatedByUserId) {
    where.OR = [{ owner_id: filter.ownedOrCreatedByUserId }, { created_by: filter.ownedOrCreatedByUserId }];
  }
  if (filter.dueBefore || filter.dueAfter) {
    const dueDateFilter: Record<string, Date> = {};
    if (filter.dueBefore) dueDateFilter.lte = new Date(filter.dueBefore);
    if (filter.dueAfter) dueDateFilter.gte = new Date(filter.dueAfter);
    where.due_date = dueDateFilter;
  }
  if (filter.search) {
    where.title = { contains: filter.search, mode: 'insensitive' };
  }

  const [tasks, total] = await Promise.all([
    prisma.coreTask.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: [{ due_date: 'asc' }, { created_at: 'desc' }],
      include: {
        owner: { select: { id: true, first_name: true, last_name: true, email: true } },
        function: { select: { id: true, name: true } },
        sub_tasks: { orderBy: { sort_order: 'asc' } },
        _count: { select: { watchers: true } },
      },
    }),
    prisma.coreTask.count({ where }),
  ]);

  return { tasks, total };
}

export async function getTaskById(id: string, tenantId: string) {
  return prisma.coreTask.findFirst({
    where: { id, tenant_id: tenantId, deleted_at: null },
    include: {
      owner: { select: { id: true, first_name: true, last_name: true, email: true } },
      creator: { select: { id: true, first_name: true, last_name: true } },
      function: { select: { id: true, name: true } },
      sub_tasks: { orderBy: { sort_order: 'asc' } },
      watchers: { include: { user: { select: { id: true, first_name: true, last_name: true, email: true } } } },
      recurrence: true,
    },
  });
}

export async function updateTask(
  id: string,
  tenantId: string,
  userId: string,
  data: {
    title?: string;
    description?: string;
    status?: CoreTaskStatus;
    priority?: CoreTaskPriority;
    ownerId?: string;
    functionId?: string | null;
    dueDate?: string | null;
    subTasks?: { id?: string; title: string; completed: boolean; sortOrder: number }[];
    addWatcherIds?: string[];
    removeWatcherIds?: string[];
    recurrence?: { frequency: CoreTaskRecurrenceFrequency; nextDue: string } | null;
  },
) {
  const task = await prisma.coreTask.findFirst({ where: { id, tenant_id: tenantId, deleted_at: null } });
  if (!task) return null;

  const updateData: Record<string, unknown> = { updated_at: new Date() };
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.ownerId !== undefined) updateData.owner_id = data.ownerId;
  if (data.functionId !== undefined) updateData.function_id = data.functionId;
  if ('dueDate' in data) updateData.due_date = data.dueDate ? new Date(data.dueDate) : null;

  const completingNow = data.status && data.status !== task.status && data.status === 'done';
  if (data.status !== undefined) {
    updateData.status = data.status;
    if (completingNow) updateData.completed_at = new Date();
    else if (data.status !== 'done') updateData.completed_at = null;
  }

  await prisma.$transaction(async (tx) => {
    await tx.coreTask.update({ where: { id }, data: updateData });

    if (data.subTasks !== undefined) {
      await tx.coreTaskSubTask.deleteMany({ where: { task_id: id } });
      if (data.subTasks.length) {
        await tx.coreTaskSubTask.createMany({
          data: data.subTasks.map((st) => ({
            task_id: id,
            title: st.title,
            completed: st.completed,
            sort_order: st.sortOrder,
          })),
        });
      }
    }

    if (data.addWatcherIds?.length) {
      await tx.coreTaskWatcher.createMany({
        data: data.addWatcherIds.map((uid) => ({ task_id: id, user_id: uid })),
        skipDuplicates: true,
      });
    }
    if (data.removeWatcherIds?.length) {
      await tx.coreTaskWatcher.deleteMany({
        where: { task_id: id, user_id: { in: data.removeWatcherIds } },
      });
    }

    if ('recurrence' in data) {
      if (data.recurrence === null) {
        await tx.coreTaskRecurrenceConfig.deleteMany({ where: { task_id: id } });
      } else if (data.recurrence) {
        await tx.coreTaskRecurrenceConfig.upsert({
          where: { task_id: id },
          create: {
            task_id: id,
            frequency: data.recurrence.frequency,
            next_due: new Date(data.recurrence.nextDue),
          },
          update: {
            frequency: data.recurrence.frequency,
            next_due: new Date(data.recurrence.nextDue),
          },
        });
      }
    }
  });

  // On completion, auto-create next recurrence if configured
  if (completingNow) {
    const recurrence = await prisma.coreTaskRecurrenceConfig.findUnique({ where: { task_id: id } });
    if (recurrence) {
      const nextDue = recurrence.next_due;
      const newDue = advanceDueDate(nextDue, recurrence.frequency);
      const newTask = await prisma.coreTask.create({
        data: {
          tenant_id: task.tenant_id,
          title: task.title,
          description: task.description,
          priority: task.priority,
          source: task.source,
          source_id: task.source_id,
          source_module: task.source_module,
          owner_id: task.owner_id,
          function_id: task.function_id,
          due_date: nextDue,
          created_by: userId ?? null,
        },
      });
      await prisma.coreTaskRecurrenceConfig.create({
        data: {
          task_id: newTask.id,
          frequency: recurrence.frequency,
          next_due: newDue,
          last_created_at: new Date(),
        },
      });
      await prisma.coreTaskRecurrenceConfig.update({
        where: { task_id: id },
        data: { last_created_at: new Date(), next_due: newDue },
      });
    }
  }

  return getTaskById(id, tenantId);
}

function advanceDueDate(date: Date, frequency: CoreTaskRecurrenceFrequency): Date {
  const d = new Date(date);
  switch (frequency) {
    case 'daily': d.setDate(d.getDate() + 1); break;
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'annual': d.setFullYear(d.getFullYear() + 1); break;
  }
  return d;
}

export async function softDeleteTask(id: string, tenantId: string) {
  const task = await prisma.coreTask.findFirst({ where: { id, tenant_id: tenantId, deleted_at: null } });
  if (!task) return null;
  return prisma.coreTask.update({ where: { id }, data: { deleted_at: new Date() } });
}

export async function getTaskStats(tenantId: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [total, todo, in_progress, waiting, done, cancelled, overdue] = await Promise.all([
    prisma.coreTask.count({ where: { tenant_id: tenantId, deleted_at: null } }),
    prisma.coreTask.count({ where: { tenant_id: tenantId, deleted_at: null, status: 'todo' } }),
    prisma.coreTask.count({ where: { tenant_id: tenantId, deleted_at: null, status: 'in_progress' } }),
    prisma.coreTask.count({ where: { tenant_id: tenantId, deleted_at: null, status: 'waiting' } }),
    prisma.coreTask.count({ where: { tenant_id: tenantId, deleted_at: null, status: 'done' } }),
    prisma.coreTask.count({ where: { tenant_id: tenantId, deleted_at: null, status: 'cancelled' } }),
    prisma.coreTask.count({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
        status: { notIn: ['done', 'cancelled'] },
        due_date: { lt: today },
      },
    }),
  ]);

  return { total, todo, in_progress, waiting, done, cancelled, overdue };
}

// ── Template library ──────────────────────────────────────────────────────────

export async function listTemplates(tenantId: string) {
  return prisma.coreTaskTemplate.findMany({
    where: { tenant_id: tenantId, deleted_at: null },
    orderBy: [{ is_system: 'desc' }, { created_at: 'asc' }],
  });
}

export async function createTemplate(
  tenantId: string,
  createdBy: string,
  data: {
    title: string;
    description?: string;
    sourceTag?: CoreTaskSource;
    defaultPriority?: CoreTaskPriority;
    defaultAssigneeRole?: string;
    isSystem?: boolean;
  },
) {
  return prisma.coreTaskTemplate.create({
    data: {
      tenant_id: tenantId,
      title: data.title,
      description: data.description,
      source_tag: data.sourceTag ?? 'manual',
      default_priority: data.defaultPriority ?? 'medium',
      default_assignee_role: data.defaultAssigneeRole,
      is_system: data.isSystem ?? false,
      created_by: createdBy,
    },
  });
}

export async function createTaskFromTemplate(
  templateId: string,
  tenantId: string,
  userId: string,
  overrides: { ownerId: string; dueDate?: string; functionId?: string },
) {
  const tpl = await prisma.coreTaskTemplate.findFirst({
    where: { id: templateId, tenant_id: tenantId, deleted_at: null },
  });
  if (!tpl) return null;

  return createTask({
    tenantId,
    title: tpl.title,
    description: tpl.description ?? undefined,
    priority: tpl.default_priority,
    source: 'template',
    ownerId: overrides.ownerId,
    functionId: overrides.functionId,
    dueDate: overrides.dueDate,
    createdBy: userId,
  });
}

// ── System template seed ──────────────────────────────────────────────────────

const SYSTEM_TEMPLATES = [
  { title: 'Annual ROPA Review', description: 'Review and update all Records of Processing Activities entries annually as required by GDPR Art. 30.', sourceTag: 'review' as CoreTaskSource, defaultPriority: 'high' as CoreTaskPriority },
  { title: 'Quarterly DPA Check', description: 'Review all Data Processing Agreements with processors for validity and expiry.', sourceTag: 'compliance' as CoreTaskSource, defaultPriority: 'medium' as CoreTaskPriority },
  { title: 'Breach Simulation Drill', description: 'Conduct a tabletop breach simulation exercise to test the incident response process.', sourceTag: 'system' as CoreTaskSource, defaultPriority: 'medium' as CoreTaskPriority },
  { title: 'Training Audit', description: 'Verify that all staff have completed required privacy and data protection training.', sourceTag: 'compliance' as CoreTaskSource, defaultPriority: 'medium' as CoreTaskPriority },
  { title: 'Consent Audit', description: 'Review all active consent records for validity, scope, and withdrawal mechanism.', sourceTag: 'compliance' as CoreTaskSource, defaultPriority: 'high' as CoreTaskPriority },
  { title: 'DPIA Schedule Review', description: 'Review scheduled DPIAs and ensure in-progress assessments are on track.', sourceTag: 'compliance' as CoreTaskSource, defaultPriority: 'high' as CoreTaskPriority },
];

export async function seedSystemTemplates(tenantId: string) {
  for (const tpl of SYSTEM_TEMPLATES) {
    const existing = await prisma.coreTaskTemplate.findFirst({
      where: { tenant_id: tenantId, title: tpl.title, is_system: true },
    });
    if (!existing) {
      await prisma.coreTaskTemplate.create({
        data: {
          tenant_id: tenantId,
          title: tpl.title,
          description: tpl.description,
          source_tag: tpl.sourceTag,
          default_priority: tpl.defaultPriority,
          is_system: true,
        },
      });
    }
  }
}

export { CoreTaskStatus, CoreTaskPriority, CoreTaskSource, CoreTaskRecurrenceFrequency };
