import { and, asc, eq, isNull, lt, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import type { CreateTaskInput, TaskQuery, UpdateTaskInput } from '../contracts.ts';
import type { Conn } from '../db.ts';
import { CLOSED_PROJECT_STATUSES, type ActivityAction } from '../enums.ts';
import { invalid, notFound } from '../errors.ts';
import { milestones, projects, tasks, themes, type NewTask, type Task } from '../schema.ts';
import type { TaskView } from '../types.ts';
import { isoWeekKey } from '../week.ts';
import { diffFields, logActivity } from './activity.ts';

/** 任务实际所属的议题：直接挂议题的取 tasks.theme_id，否则取所属课题的议题。 */
const ownerThemeId = sql<number | null>`coalesce(${tasks.themeId}, ${projects.themeId})`;

function taskViewQuery(db: Conn) {
  return db
    .select({
      task: tasks,
      projectTitle: projects.title,
      milestoneTitle: milestones.title,
      ownerThemeId,
      themeTitle: themes.title,
    })
    .from(tasks)
    .leftJoin(projects, eq(tasks.projectId, projects.id))
    .leftJoin(milestones, eq(tasks.milestoneId, milestones.id))
    .leftJoin(themes, eq(themes.id, ownerThemeId))
    .$dynamic();
}

type TaskViewRow = {
  task: Task;
  projectTitle: string | null;
  milestoneTitle: string | null;
  ownerThemeId: number | null;
  themeTitle: string | null;
};

function toView(row: TaskViewRow): TaskView {
  return {
    ...row.task,
    projectTitle: row.projectTitle,
    milestoneTitle: row.milestoneTitle,
    ownerThemeId: row.ownerThemeId,
    themeTitle: row.themeTitle,
  };
}

/** 默认排序：未完成在前，其次按优先级、创建顺序。 */
const defaultOrder = [sql`${tasks.status} = 'done'`, asc(tasks.priority), asc(tasks.id)];

/** 按条件查询任务视图。供其他服务组合使用。 */
export function queryTaskViews(db: Conn, where: SQL | undefined, order: SQL[] = defaultOrder): TaskView[] {
  return taskViewQuery(db)
    .where(where)
    .orderBy(...order)
    .all()
    .map(toView);
}

/** 所属课题未结束（或没有课题）的条件，用于从待办池里排除已完成/放弃课题的任务。 */
export const projectStillOpen = or(
  isNull(tasks.projectId),
  notInArray(projects.status, [...CLOSED_PROJECT_STATUSES]),
);

export function listTasks(db: Conn, q: TaskQuery = {}): TaskView[] {
  const conds: SQL[] = [];
  if (q.projectId !== undefined) conds.push(eq(tasks.projectId, q.projectId));
  if (q.themeId !== undefined) conds.push(sql`${ownerThemeId} = ${q.themeId}`);
  if (q.weekKey !== undefined) conds.push(eq(tasks.weekKey, q.weekKey));
  if (q.scheduledDate !== undefined) conds.push(eq(tasks.scheduledDate, q.scheduledDate));
  if (q.status !== undefined) conds.push(eq(tasks.status, q.status));
  if (q.open === true) conds.push(ne(tasks.status, 'done'));
  if (q.open === false) conds.push(eq(tasks.status, 'done'));
  return queryTaskViews(db, conds.length ? and(...conds) : undefined);
}

export function getTaskView(db: Conn, id: number): TaskView {
  const row = taskViewQuery(db).where(eq(tasks.id, id)).get();
  if (!row) throw notFound('任务', id);
  return toView(row);
}

function getTaskRow(db: Conn, id: number): Task {
  const row = db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!row) throw notFound('任务', id);
  return row;
}

type Owner = { projectId: number | null; themeId: number | null; milestoneId: number | null };

/** 校验并补全任务归属：只能属于一个课题或一个议题；里程碑必须属于该课题。 */
function resolveOwner(db: Conn, owner: Owner): Owner {
  let { projectId, themeId } = owner;
  const { milestoneId } = owner;

  if (milestoneId !== null) {
    const m = db.select().from(milestones).where(eq(milestones.id, milestoneId)).get();
    if (!m) throw notFound('里程碑', milestoneId);
    if (projectId !== null && projectId !== m.projectId) throw invalid('里程碑不属于该课题');
    projectId = m.projectId;
    themeId = null;
  }

  if (projectId !== null && themeId !== null)
    throw invalid('任务只能归属一个课题或一个议题，不能同时归属两者');
  if (projectId === null && themeId === null) throw invalid('任务需要归属某个课题或议题');

  if (projectId !== null) {
    if (!db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).get()) {
      throw notFound('课题', projectId);
    }
  } else if (themeId !== null) {
    if (!db.select({ id: themes.id }).from(themes).where(eq(themes.id, themeId)).get()) {
      throw notFound('议题', themeId);
    }
  }
  return { projectId, themeId, milestoneId };
}

export function createTask(db: Conn, input: CreateTaskInput): TaskView {
  const owner = resolveOwner(db, {
    projectId: input.projectId ?? null,
    themeId: input.themeId ?? null,
    milestoneId: input.milestoneId ?? null,
  });
  const scheduledDate = input.scheduledDate ?? null;
  // 排到某一天的任务自动属于那一天所在的周。
  const weekKey = scheduledDate ? isoWeekKey(scheduledDate) : (input.weekKey ?? null);
  const status = input.status ?? 'todo';

  const values: NewTask = {
    ...owner,
    title: input.title,
    notes: input.notes ?? null,
    status,
    priority: input.priority ?? 2,
    estimateMin: input.estimateMin ?? null,
    weekKey,
    scheduledDate,
    doneAt: status === 'done' ? new Date() : null,
  };
  const row = db.insert(tasks).values(values).returning({ id: tasks.id }).get();
  const view = getTaskView(db, row.id);
  logActivity(db, {
    entityType: 'task',
    entityId: view.id,
    action: 'created',
    projectId: view.projectId,
    themeId: view.ownerThemeId,
    payload: { title: view.title },
  });
  return view;
}

/** 根据变化的字段挑一个最能概括这次修改的动作。 */
function taskAction(changes: Record<string, [unknown, unknown]>): ActivityAction {
  if (changes.status) {
    const [from, to] = changes.status;
    if (to === 'done') return 'completed';
    if (from === 'done') return 'reopened';
    return 'status_changed';
  }
  if (changes.scheduledDate || changes.weekKey) {
    const date = changes.scheduledDate ? changes.scheduledDate[1] : undefined;
    const week = changes.weekKey ? changes.weekKey[1] : undefined;
    return date || week ? 'scheduled' : 'unscheduled';
  }
  if (changes.projectId || changes.themeId || changes.milestoneId) return 'moved';
  return 'updated';
}

export function updateTask(db: Conn, id: number, patch: UpdateTaskInput): TaskView {
  const existing = getTaskRow(db, id);
  const set: Partial<NewTask> = {};

  // 归属变更：改到议题下时清空课题和里程碑；换课题时清空原里程碑。
  if (patch.projectId !== undefined || patch.themeId !== undefined || patch.milestoneId !== undefined) {
    let projectId = patch.projectId !== undefined ? patch.projectId : existing.projectId;
    let themeId = patch.themeId !== undefined ? patch.themeId : existing.themeId;
    let milestoneId = patch.milestoneId !== undefined ? patch.milestoneId : existing.milestoneId;
    if (patch.themeId != null && patch.projectId === undefined) {
      projectId = null;
      if (patch.milestoneId === undefined) milestoneId = null;
    }
    if (patch.projectId != null && patch.themeId === undefined) themeId = null;
    if (
      patch.projectId !== undefined &&
      patch.projectId !== existing.projectId &&
      patch.milestoneId === undefined
    ) {
      milestoneId = null;
    }
    Object.assign(set, resolveOwner(db, { projectId, themeId, milestoneId }));
  }

  // 排期：排到某天会同时确定所在周；换到别的周会取消原来的具体日期。
  if (patch.scheduledDate !== undefined) {
    set.scheduledDate = patch.scheduledDate;
    if (patch.scheduledDate !== null) set.weekKey = isoWeekKey(patch.scheduledDate);
    else if (patch.weekKey !== undefined) set.weekKey = patch.weekKey;
  } else if (patch.weekKey !== undefined) {
    set.weekKey = patch.weekKey;
    if (
      existing.scheduledDate &&
      (patch.weekKey === null || isoWeekKey(existing.scheduledDate) !== patch.weekKey)
    ) {
      set.scheduledDate = null;
    }
  }

  if (patch.status !== undefined && patch.status !== existing.status) {
    set.status = patch.status;
    set.doneAt = patch.status === 'done' ? new Date() : null;
  }

  if (patch.title !== undefined) set.title = patch.title;
  if (patch.notes !== undefined) set.notes = patch.notes;
  if (patch.priority !== undefined) set.priority = patch.priority;
  if (patch.estimateMin !== undefined) set.estimateMin = patch.estimateMin;

  const { doneAt: _doneAt, ...visible } = set;
  const changes = diffFields(existing, visible);
  if (Object.keys(set).length > 0) db.update(tasks).set(set).where(eq(tasks.id, id)).run();
  const view = getTaskView(db, id);
  if (Object.keys(changes).length > 0) {
    logActivity(db, {
      entityType: 'task',
      entityId: id,
      action: taskAction(changes),
      projectId: view.projectId,
      themeId: view.ownerThemeId,
      payload: { title: view.title, changes },
    });
  }
  return view;
}

export function deleteTask(db: Conn, id: number): void {
  const view = getTaskView(db, id);
  db.delete(tasks).where(eq(tasks.id, id)).run();
  logActivity(db, {
    entityType: 'task',
    entityId: id,
    action: 'deleted',
    projectId: view.projectId,
    themeId: view.ownerThemeId,
    payload: { title: view.title },
  });
}

/** 更早日期排了但没做完的任务。 */
export function unfinishedBeforeDate(db: Conn, date: string): TaskView[] {
  return queryTaskViews(db, and(lt(tasks.scheduledDate, date), ne(tasks.status, 'done')), [
    asc(tasks.scheduledDate),
    asc(tasks.priority),
    asc(tasks.id),
  ]);
}

/** 更早的周排了但没做完、也没被排到具体日期后移走的任务。 */
export function unfinishedBeforeWeek(db: Conn, weekKey: string): TaskView[] {
  // 'YYYY-Www' 是定长、零填充的，可以直接按字符串比较先后。
  return queryTaskViews(db, and(lt(tasks.weekKey, weekKey), ne(tasks.status, 'done')), [
    asc(tasks.weekKey),
    asc(tasks.priority),
    asc(tasks.id),
  ]);
}
