import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import {
  ACTIVITY_ACTIONS,
  ENTITY_TYPES,
  REVIEW_KINDS,
  PROJECT_KINDS,
  PROJECT_STATUSES,
  PROMOTE_TYPES,
  RESOURCE_KINDS,
  RESOURCE_OWNER_TYPES,
  TASK_STATUSES,
  THEME_STATUSES,
} from './enums.ts';

// 约定：
// - 日期（没有时刻）一律存为 'YYYY-MM-DD' 文本，便于按天比较和展示。
// - 时刻（创建、更新、完成时间）存为毫秒时间戳。
// - 周用 ISO 周编号 'YYYY-Www'，见 week.ts。

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
};

/** 研究议题：长期、开放式的研究方向，可持续多年。 */
export const themes = sqliteTable('themes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  description: text('description'),
  coreQuestions: text('core_questions', { mode: 'json' }).$type<string[]>().notNull().default([]),
  status: text('status', { enum: THEME_STATUSES }).notNull().default('active'),
  startedAt: text('started_at'),
  reviewCadenceDays: integer('review_cadence_days').notNull().default(30),
  ...timestamps,
});

/** 课题：有明确交付物的长期工作，例如一篇论文、一项基金、一章学位论文。 */
export const projects = sqliteTable(
  'projects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    themeId: integer('theme_id').references(() => themes.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    kind: text('kind', { enum: PROJECT_KINDS }).notNull().default('other'),
    status: text('status', { enum: PROJECT_STATUSES }).notNull().default('idea'),
    priority: integer('priority').notNull().default(2),
    startedAt: text('started_at'),
    deadline: text('deadline'),
    description: text('description'),
    /** "我们现在到哪了"：一段随时更新的现状描述。 */
    currentStatus: text('current_status'),
    ...timestamps,
  },
  (t) => [
    index('projects_theme_idx').on(t.themeId),
    check('projects_priority_range', sql`${t.priority} BETWEEN 1 AND 3`),
  ],
);

/** 里程碑：课题内带目标日期的阶段节点。 */
export const milestones = sqliteTable(
  'milestones',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    dueDate: text('due_date'),
    doneAt: integer('done_at', { mode: 'timestamp_ms' }),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('milestones_project_idx').on(t.projectId)],
);

/** 任务：唯一的工作原子。必须挂在某个课题或某个议题下。 */
export const tasks = sqliteTable(
  'tasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    themeId: integer('theme_id').references(() => themes.id, { onDelete: 'cascade' }),
    milestoneId: integer('milestone_id').references(() => milestones.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    notes: text('notes'),
    status: text('status', { enum: TASK_STATUSES }).notNull().default('todo'),
    priority: integer('priority').notNull().default(2),
    estimateMin: integer('estimate_min'),
    /** 排入哪一天（日计划）。 */
    scheduledDate: text('scheduled_date'),
    /** 排入哪一周（周计划），ISO 周编号。 */
    weekKey: text('week_key'),
    doneAt: integer('done_at', { mode: 'timestamp_ms' }),
    ...timestamps,
  },
  (t) => [
    index('tasks_project_idx').on(t.projectId),
    index('tasks_theme_idx').on(t.themeId),
    index('tasks_week_idx').on(t.weekKey),
    index('tasks_scheduled_idx').on(t.scheduledDate),
    index('tasks_status_idx').on(t.status),
    check('tasks_has_owner', sql`${t.projectId} IS NOT NULL OR ${t.themeId} IS NOT NULL`),
    check('tasks_priority_range', sql`${t.priority} BETWEEN 1 AND 3`),
  ],
);

export type WeeklyReview = {
  wins: string[];
  blockers: string[];
  carryOver: string[];
  reflection: string;
};

/** 周计划：本周重点 + 周末复盘。任务通过 tasks.week_key 关联，不复制。 */
export const weeklyPlans = sqliteTable('weekly_plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  weekKey: text('week_key').notNull().unique(),
  focus: text('focus', { mode: 'json' }).$type<string[]>().notNull().default([]),
  review: text('review', { mode: 'json' }).$type<WeeklyReview>(),
  reviewedAt: integer('reviewed_at', { mode: 'timestamp_ms' }),
  ...timestamps,
});

export type DailyReview = {
  done: string;
  blockers: string;
  tomorrow: string;
};

/** 日计划：当日 Top 3 任务、工作日志、晚间复盘。 */
export const dailyPlans = sqliteTable('daily_plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull().unique(),
  topTaskIds: text('top_task_ids', { mode: 'json' }).$type<number[]>().notNull().default([]),
  journal: text('journal'),
  review: text('review', { mode: 'json' }).$type<DailyReview>(),
  reviewedAt: integer('reviewed_at', { mode: 'timestamp_ms' }),
  ...timestamps,
});

/** 收件箱：随手记录的想法，之后可升级为任务、课题或议题。 */
export const inboxItems = sqliteTable('inbox_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  content: text('content').notNull(),
  promotedType: text('promoted_type', { enum: PROMOTE_TYPES }),
  promotedId: integer('promoted_id'),
  ...timestamps,
});

/** 资源链接：Overleaf、数据集、Zotero 条目等，挂在议题、课题或任务上。 */
export const resources = sqliteTable(
  'resources',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ownerType: text('owner_type', { enum: RESOURCE_OWNER_TYPES }).notNull(),
    ownerId: integer('owner_id').notNull(),
    kind: text('kind', { enum: RESOURCE_KINDS }).notNull(),
    ref: text('ref').notNull(),
    label: text('label'),
    ...timestamps,
  },
  (t) => [index('resources_owner_idx').on(t.ownerType, t.ownerId)],
);

export type ActivityPayload = {
  /** 写入时对象的标题快照：对象被删除后仍能看懂这条记录。 */
  title?: string;
  /** 变化的字段：[旧值, 新值]。 */
  changes?: Record<string, [unknown, unknown]>;
  /** 其他补充信息，例如周编号、日期、升级后的类型。 */
  [key: string]: unknown;
};

/**
 * 活动日志：记录所有写操作，用于判断课题是否停滞以及回看历史。
 * project_id / theme_id 是写入时的上下文，不设外键：对象删除后记录仍保留。
 */
export const activityLog = sqliteTable(
  'activity_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    entityType: text('entity_type', { enum: ENTITY_TYPES }).notNull(),
    entityId: integer('entity_id').notNull(),
    action: text('action', { enum: ACTIVITY_ACTIONS }).notNull(),
    projectId: integer('project_id'),
    themeId: integer('theme_id'),
    payload: text('payload', { mode: 'json' }).$type<ActivityPayload>(),
    at: integer('at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    index('activity_entity_idx').on(t.entityType, t.entityId),
    index('activity_at_idx').on(t.at),
    index('activity_project_idx').on(t.projectId, t.at),
    index('activity_theme_idx').on(t.themeId, t.at),
  ],
);

export type WeekReviewStats = {
  focus: string[];
  done: number;
  total: number;
  completed: string[];
  unfinished: string[];
};

export type DayReviewStats = {
  topTasks: { title: string; done: boolean }[];
  done: number;
  total: number;
};

/**
 * 复盘快照：每保存一次复盘就追加一条，从不修改或删除，构成研究历史。
 * weekly_plans / daily_plans 里的 review 字段只保存最新一版，方便继续编辑。
 */
export const reviews = sqliteTable(
  'reviews',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    kind: text('kind', { enum: REVIEW_KINDS }).notNull(),
    /** 周复盘为 'YYYY-Www'，日复盘为 'YYYY-MM-DD'。 */
    periodKey: text('period_key').notNull(),
    content: text('content', { mode: 'json' }).$type<WeeklyReview | DailyReview>().notNull(),
    /** 保存时自动统计的完成情况。 */
    stats: text('stats', { mode: 'json' }).$type<WeekReviewStats | DayReviewStats>().notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('reviews_period_idx').on(t.kind, t.periodKey)],
);

export type Theme = typeof themes.$inferSelect;
export type NewTheme = typeof themes.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Milestone = typeof milestones.$inferSelect;
export type NewMilestone = typeof milestones.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type WeeklyPlan = typeof weeklyPlans.$inferSelect;
export type DailyPlan = typeof dailyPlans.$inferSelect;
export type InboxItem = typeof inboxItems.$inferSelect;
export type Resource = typeof resources.$inferSelect;
export type ActivityLogEntry = typeof activityLog.$inferSelect;
export type Review = typeof reviews.$inferSelect;
