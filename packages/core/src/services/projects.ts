import { asc, eq, sql } from 'drizzle-orm';
import type { CreateProjectInput, UpdateProjectInput } from '../contracts.ts';
import type { Conn } from '../db.ts';
import { notFound } from '../errors.ts';
import {
  milestones,
  projects,
  tasks,
  themes,
  type Milestone,
  type NewProject,
  type Project,
} from '../schema.ts';
import type { MilestoneView, ProjectDetail } from '../types.ts';
import { progressFromTasks } from './progress.ts';
import { queryTaskViews } from './tasks.ts';

/** 课题排序：进行中在前，已完成、已放弃在后；同状态按优先级和截止日期。 */
export const projectOrder = [
  sql`case ${projects.status} when 'active' then 0 when 'idea' then 1 when 'paused' then 2 when 'submitted' then 3 when 'done' then 4 else 5 end`,
  asc(projects.priority),
  sql`${projects.deadline} is null`,
  asc(projects.deadline),
  asc(projects.id),
];

export const milestoneOrder = [
  asc(milestones.sortOrder),
  sql`${milestones.dueDate} is null`,
  asc(milestones.dueDate),
  asc(milestones.id),
];

export function listProjects(db: Conn, filter: { themeId?: number } = {}): Project[] {
  const q = db.select().from(projects).$dynamic();
  if (filter.themeId !== undefined) q.where(eq(projects.themeId, filter.themeId));
  return q.orderBy(...projectOrder).all();
}

export function getProject(db: Conn, id: number): Project {
  const row = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!row) throw notFound('课题', id);
  return row;
}

function assertThemeExists(db: Conn, themeId: number | null | undefined): void {
  if (themeId == null) return;
  if (!db.select({ id: themes.id }).from(themes).where(eq(themes.id, themeId)).get()) {
    throw notFound('议题', themeId);
  }
}

export function createProject(db: Conn, input: CreateProjectInput): Project {
  assertThemeExists(db, input.themeId);
  const values: NewProject = {
    themeId: input.themeId ?? null,
    title: input.title,
    kind: input.kind ?? 'other',
    status: input.status ?? 'active',
    priority: input.priority ?? 2,
    startedAt: input.startedAt ?? null,
    deadline: input.deadline ?? null,
    description: input.description ?? null,
    currentStatus: input.currentStatus ?? null,
  };
  return db.insert(projects).values(values).returning().get();
}

export function updateProject(db: Conn, id: number, patch: UpdateProjectInput): Project {
  getProject(db, id);
  assertThemeExists(db, patch.themeId);
  const set: Partial<NewProject> = {};
  for (const key of [
    'themeId',
    'title',
    'kind',
    'status',
    'priority',
    'startedAt',
    'deadline',
    'description',
    'currentStatus',
  ] as const) {
    if (patch[key] !== undefined) Object.assign(set, { [key]: patch[key] });
  }
  if (Object.keys(set).length > 0) db.update(projects).set(set).where(eq(projects.id, id)).run();
  return getProject(db, id);
}

/** 删除课题：其里程碑和任务一并删除。 */
export function deleteProject(db: Conn, id: number): void {
  const res = db.delete(projects).where(eq(projects.id, id)).run();
  if (res.changes === 0) throw notFound('课题', id);
}

/** 给里程碑附上各自的任务完成进度。 */
export function withMilestoneProgress(
  items: Milestone[],
  taskList: readonly { milestoneId: number | null; status: (typeof tasks.$inferSelect)['status'] }[],
): MilestoneView[] {
  return items.map((m) => ({
    ...m,
    progress: progressFromTasks(taskList.filter((t) => t.milestoneId === m.id)),
  }));
}

export function getProjectDetail(db: Conn, id: number): ProjectDetail {
  const project = getProject(db, id);
  const theme =
    project.themeId === null
      ? null
      : (db
          .select({ id: themes.id, title: themes.title })
          .from(themes)
          .where(eq(themes.id, project.themeId))
          .get() ?? null);
  const taskViews = queryTaskViews(db, eq(tasks.projectId, id));
  const ms = db
    .select()
    .from(milestones)
    .where(eq(milestones.projectId, id))
    .orderBy(...milestoneOrder)
    .all();
  return {
    ...project,
    theme,
    progress: progressFromTasks(taskViews),
    milestones: withMilestoneProgress(ms, taskViews),
    tasks: taskViews,
  };
}
