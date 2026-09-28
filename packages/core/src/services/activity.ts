import { and, desc, eq, isNotNull, lt, max, type SQL } from 'drizzle-orm';
import type { Conn } from '../db.ts';
import {
  PROJECT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  THEME_STATUS_LABELS,
  type ActivityAction,
  type EntityType,
  type ProjectStatus,
  type TaskStatus,
  type ThemeStatus,
} from '../enums.ts';
import { activityLog, projects, type ActivityLogEntry, type ActivityPayload } from '../schema.ts';
import type { ActivityView } from '../types.ts';

export type ActivityInput = {
  entityType: EntityType;
  entityId: number;
  action: ActivityAction;
  projectId?: number | null;
  themeId?: number | null;
  payload?: ActivityPayload;
};

/** 记一条活动。服务层的每个写操作都应调用它。 */
export function logActivity(db: Conn, input: ActivityInput): void {
  db.insert(activityLog)
    .values({
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      projectId: input.projectId ?? null,
      themeId: input.themeId ?? null,
      payload: input.payload ?? null,
    })
    .run();
}

/** 课题所属的议题，用于给活动记录补上下文。 */
export function themeOfProject(db: Conn, projectId: number | null): number | null {
  if (projectId === null) return null;
  return (
    db.select({ themeId: projects.themeId }).from(projects).where(eq(projects.id, projectId)).get()
      ?.themeId ?? null
  );
}

/** 比较两个对象，返回发生变化的字段 [旧值, 新值]。 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, [unknown, unknown]> {
  const changes: Record<string, [unknown, unknown]> = {};
  for (const [key, value] of Object.entries(after)) {
    const old = before[key];
    const same =
      old instanceof Date && value instanceof Date
        ? old.getTime() === value.getTime()
        : JSON.stringify(old) === JSON.stringify(value);
    if (!same) changes[key] = [old, value];
  }
  return changes;
}

/** 每个课题最近一次活动的时间。 */
export function lastActivityByProject(db: Conn): Map<number, Date> {
  const rows = db
    .select({ projectId: activityLog.projectId, at: max(activityLog.at) })
    .from(activityLog)
    .where(isNotNull(activityLog.projectId))
    .groupBy(activityLog.projectId)
    .all();
  const map = new Map<number, Date>();
  for (const r of rows) {
    if (r.projectId !== null && r.at) map.set(r.projectId, r.at);
  }
  return map;
}

export type ActivityQuery = {
  projectId?: number;
  themeId?: number;
  /** 只取 id 小于它的记录，用于翻页。 */
  before?: number;
  limit?: number;
};

export function listActivity(db: Conn, q: ActivityQuery = {}): ActivityView[] {
  const conds: SQL[] = [];
  if (q.projectId !== undefined) conds.push(eq(activityLog.projectId, q.projectId));
  if (q.themeId !== undefined) conds.push(eq(activityLog.themeId, q.themeId));
  if (q.before !== undefined) conds.push(lt(activityLog.id, q.before));
  return db
    .select()
    .from(activityLog)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(activityLog.id))
    .limit(Math.min(q.limit ?? 30, 200))
    .all()
    .map((e) => ({ ...e, summary: describeActivity(e) }));
}

// ---------- 中文说明 ----------

const ENTITY_LABELS: Record<EntityType, string> = {
  theme: '议题',
  project: '课题',
  milestone: '里程碑',
  task: '任务',
  weekly_plan: '周计划',
  daily_plan: '日计划',
  inbox_item: '收件箱记录',
  resource: '资源',
};

const FIELD_LABELS: Record<string, string> = {
  title: '标题',
  description: '说明',
  notes: '备注',
  coreQuestions: '核心问题',
  status: '状态',
  kind: '类型',
  priority: '优先级',
  startedAt: '开始日期',
  deadline: '截止日期',
  dueDate: '目标日期',
  currentStatus: '现状',
  reviewCadenceDays: '回顾周期',
  countdownAt: '倒计时',
  estimateMin: '预估时间',
  themeId: '所属议题',
  projectId: '所属课题',
  milestoneId: '里程碑',
  sortOrder: '顺序',
};

function monthDay(date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

function statusLabel(entityType: EntityType, status: unknown): string {
  if (typeof status !== 'string') return '';
  if (entityType === 'task') return TASK_STATUS_LABELS[status as TaskStatus] ?? status;
  if (entityType === 'project') return PROJECT_STATUS_LABELS[status as ProjectStatus] ?? status;
  if (entityType === 'theme') return THEME_STATUS_LABELS[status as ThemeStatus] ?? status;
  return status;
}

/** 把一条活动记录转成一句中文，例如：完成任务"跑回归"。 */
export function describeActivity(e: Pick<ActivityLogEntry, 'entityType' | 'action' | 'payload'>): string {
  const p = e.payload ?? {};
  const what = ENTITY_LABELS[e.entityType];
  const name = p.title ? `"${p.title}"` : '';
  const changes = p.changes ?? {};

  switch (e.action) {
    case 'created':
      return e.entityType === 'inbox_item' ? `记下：${name}` : `新建${what}${name}`;
    case 'deleted':
      return `删除${what}${name}`;
    case 'completed':
      return `完成${what}${name}`;
    case 'reopened':
      return `重新打开${what}${name}`;
    case 'status_changed': {
      const [from, to] = changes.status ?? [];
      return `${what}${name}：${statusLabel(e.entityType, from)} → ${statusLabel(e.entityType, to)}`;
    }
    case 'scheduled': {
      const date = changes.scheduledDate?.[1];
      const week = changes.weekKey?.[1];
      if (typeof date === 'string') return `${what}${name}排到${monthDay(date)}`;
      if (typeof week === 'string') return `${what}${name}排进 ${week}`;
      return `${what}${name}调整了排期`;
    }
    case 'unscheduled':
      return `${what}${name}移出计划`;
    case 'moved':
      return `${what}${name}更换了归属`;
    case 'planned':
      if (e.entityType === 'weekly_plan') return `写下 ${String(p.weekKey ?? '')} 的本周重点`;
      return `选定${typeof p.date === 'string' ? monthDay(p.date) : ''}最重要的事`;
    case 'journaled':
      return `更新${typeof p.date === 'string' ? monthDay(p.date) : ''}的工作日志`;
    case 'reviewed':
      if (e.entityType === 'weekly_plan') return `完成 ${String(p.weekKey ?? '')} 周复盘`;
      return `完成${typeof p.date === 'string' ? monthDay(p.date) : ''}的晚间复盘`;
    case 'promoted': {
      const target = typeof p.promotedType === 'string' ? ENTITY_LABELS[p.promotedType as EntityType] : '';
      return `收件箱记录${name}转为${target}`;
    }
    case 'linked':
    case 'unlinked': {
      const kind = p.kind === 'zotero' ? '文献' : p.kind === 'file' ? '文件' : '链接';
      const where = typeof p.ownerTitle === 'string' ? `（${p.ownerTitle}）` : '';
      return `${e.action === 'linked' ? '关联' : '移除'}${kind}${name}${where}`;
    }
    case 'updated': {
      if (changes.currentStatus && Object.keys(changes).length === 1) return `更新${what}${name}的现状`;
      const fields = Object.keys(changes)
        .map((k) => FIELD_LABELS[k] ?? k)
        .slice(0, 4);
      return fields.length ? `修改${what}${name}（${fields.join('、')}）` : `修改${what}${name}`;
    }
  }
}
