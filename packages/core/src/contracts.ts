// 前后端共享的契约：输入校验（zod）与接口返回的 JSON 类型。
// 这个文件及其依赖不能引入 Node 专用模块，前端会直接导入它。

import { z } from 'zod';
import {
  MAX_TOP_TASKS,
  MAX_WEEK_FOCUS,
  PROJECT_KINDS,
  PROJECT_STATUSES,
  TASK_STATUSES,
  THEME_STATUSES,
} from './enums.ts';
import { isValidDate, isValidWeekKey } from './week.ts';
import type * as S from './schema.ts';
import type * as V from './types.ts';

export * from './enums.ts';

// ---------- 基础字段 ----------

const id = z.number().int().positive();
const title = z.string().trim().min(1, '标题不能为空').max(200, '标题不能超过 200 字');
const date = z.string().refine(isValidDate, '日期格式应为 YYYY-MM-DD');
const weekKey = z.string().refine(isValidWeekKey, '周编号格式应为 YYYY-Www，例如 2026-W40');
const priority = z.number().int().min(1, '优先级为 1–3').max(3, '优先级为 1–3');

/** 可选长文本：空字符串视为清空（null）。 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `内容不能超过 ${max} 字`)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

/** 字符串列表：去掉首尾空白和空行。 */
const lineList = (maxItems: number, label: string) =>
  z
    .array(z.string().max(500, `${label}每条不能超过 500 字`))
    .transform((items) => items.map((s) => s.trim()).filter(Boolean))
    .refine((items) => items.length <= maxItems, `${label}最多 ${maxItems} 条`);

// ---------- 议题 ----------

export const createThemeInput = z.object({
  title,
  description: optionalText(5000),
  coreQuestions: lineList(20, '核心问题').optional(),
  status: z.enum(THEME_STATUSES).optional(),
  startedAt: date.nullable().optional(),
  reviewCadenceDays: z.number().int().min(1).max(365).optional(),
});
export const updateThemeInput = createThemeInput.partial();
export type CreateThemeInput = z.infer<typeof createThemeInput>;
export type UpdateThemeInput = z.infer<typeof updateThemeInput>;

// ---------- 课题 ----------

export const createProjectInput = z.object({
  themeId: id.nullable().optional(),
  title,
  kind: z.enum(PROJECT_KINDS).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  priority: priority.optional(),
  startedAt: date.nullable().optional(),
  deadline: date.nullable().optional(),
  description: optionalText(5000),
  currentStatus: optionalText(5000),
});
export const updateProjectInput = createProjectInput.partial();
export type CreateProjectInput = z.infer<typeof createProjectInput>;
export type UpdateProjectInput = z.infer<typeof updateProjectInput>;

// ---------- 里程碑 ----------

export const createMilestoneInput = z.object({
  title,
  dueDate: date.nullable().optional(),
  sortOrder: z.number().int().optional(),
});
export const updateMilestoneInput = createMilestoneInput.partial().extend({
  done: z.boolean().optional(),
});
export type CreateMilestoneInput = z.infer<typeof createMilestoneInput>;
export type UpdateMilestoneInput = z.infer<typeof updateMilestoneInput>;

// ---------- 任务 ----------

export const createTaskInput = z.object({
  projectId: id.nullable().optional(),
  themeId: id.nullable().optional(),
  milestoneId: id.nullable().optional(),
  title,
  notes: optionalText(5000),
  status: z.enum(TASK_STATUSES).optional(),
  priority: priority.optional(),
  estimateMin: z.number().int().min(1).max(1440).nullable().optional(),
  weekKey: weekKey.nullable().optional(),
  scheduledDate: date.nullable().optional(),
});
export const updateTaskInput = createTaskInput.partial();
export type CreateTaskInput = z.infer<typeof createTaskInput>;
export type UpdateTaskInput = z.infer<typeof updateTaskInput>;

/** GET /tasks 的查询参数（来自 URL，都是字符串）。 */
export const taskQuery = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  themeId: z.coerce.number().int().positive().optional(),
  weekKey: weekKey.optional(),
  scheduledDate: date.optional(),
  status: z.enum(TASK_STATUSES).optional(),
  open: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
export type TaskQuery = z.infer<typeof taskQuery>;

// ---------- 周计划与日计划 ----------

export const weekPlanInput = z.object({
  focus: lineList(MAX_WEEK_FOCUS, '本周重点'),
});
export const weekReviewInput = z.object({
  wins: lineList(30, '收获'),
  blockers: lineList(30, '阻碍'),
  carryOver: lineList(30, '带入下周'),
  reflection: z.string().trim().max(5000),
});
export const dayPlanInput = z.object({
  topTaskIds: z
    .array(id)
    .max(MAX_TOP_TASKS, `每天最重要的事最多 ${MAX_TOP_TASKS} 件`)
    .refine((ids) => new Set(ids).size === ids.length, '不能重复选择同一个任务')
    .optional(),
  journal: optionalText(20000),
});
export const dayReviewInput = z.object({
  done: z.string().trim().max(5000),
  blockers: z.string().trim().max(5000),
  tomorrow: z.string().trim().max(5000),
});
export type WeekPlanInput = z.infer<typeof weekPlanInput>;
export type WeekReviewInput = z.infer<typeof weekReviewInput>;
export type DayPlanInput = z.infer<typeof dayPlanInput>;
export type DayReviewInput = z.infer<typeof dayReviewInput>;

export const dateParam = date;
export const weekKeyParam = weekKey;

// ---------- 收件箱 ----------

export const createInboxInput = z.object({
  content: z.string().trim().min(1, '内容不能为空').max(2000, '内容不能超过 2000 字'),
});
export const promoteInboxInput = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('task'),
    title: title.optional(),
    projectId: id.nullable().optional(),
    themeId: id.nullable().optional(),
    weekKey: weekKey.nullable().optional(),
    scheduledDate: date.nullable().optional(),
  }),
  z.object({
    type: z.literal('project'),
    title: title.optional(),
    themeId: id.nullable().optional(),
  }),
  z.object({
    type: z.literal('theme'),
    title: title.optional(),
  }),
]);
export type CreateInboxInput = z.infer<typeof createInboxInput>;
export type PromoteInboxInput = z.infer<typeof promoteInboxInput>;

// ---------- 接口返回的 JSON 类型 ----------

/** 把服务层类型转成 JSON 传输后的形态：Date 变成 ISO 字符串。 */
export type Wire<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Wire<U>[]
    : T extends object
      ? { [K in keyof T]: Wire<T[K]> }
      : T;

export type ThemeDto = Wire<S.Theme>;
export type ProjectDto = Wire<S.Project>;
export type MilestoneDto = Wire<S.Milestone>;
export type TaskDto = Wire<S.Task>;
export type InboxItemDto = Wire<S.InboxItem>;
export type WeeklyReview = S.WeeklyReview;
export type DailyReview = S.DailyReview;
export type Progress = V.Progress;
export type TaskViewDto = Wire<V.TaskView>;
export type MilestoneViewDto = Wire<V.MilestoneView>;
export type ProjectSummaryDto = Wire<V.ProjectSummary>;
export type ThemeMapEntryDto = Wire<V.ThemeMapEntry>;
export type ThemeMapDto = Wire<V.ThemeMap>;
export type ProjectDetailDto = Wire<V.ProjectDetail>;
export type MilestoneDueDto = Wire<V.MilestoneDue>;
export type WeekViewDto = Wire<V.WeekView>;
export type DayViewDto = Wire<V.DayView>;
export type OwnerOptionsDto = V.OwnerOptions;
export type InboxListDto = Wire<V.InboxList>;
export type PromoteResultDto = Wire<V.PromoteResult>;
export type ApiErrorBody = { error: string; issues?: { path: string; message: string }[] };
