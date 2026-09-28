import { inArray } from 'drizzle-orm';
import type { Conn } from '../db.ts';
import { evaluateHealth, type HealthSnapshot } from '../rules/health.ts';
import { milestones, projects, tasks, themes, weeklyPlans } from '../schema.ts';
import type { HealthReport } from '../types.ts';
import { isoWeekKey, shiftWeek, toDateString } from '../week.ts';
import { lastActivityByProject } from './activity.ts';

function latest(...dates: (Date | null | undefined)[]): Date {
  let best = new Date(0);
  for (const d of dates) if (d && d.getTime() > best.getTime()) best = d;
  return best;
}

/** 从数据库收集健康检查需要的数据。 */
export function buildHealthSnapshot(db: Conn, today: string): HealthSnapshot {
  const themeRows = db.select().from(themes).all();
  const projectRows = db.select().from(projects).all();
  const milestoneRows = db.select().from(milestones).all();
  const taskRows = db
    .select({
      projectId: tasks.projectId,
      themeId: tasks.themeId,
      milestoneId: tasks.milestoneId,
      status: tasks.status,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .all();
  const logged = lastActivityByProject(db);

  // 最近活动 = 活动日志、课题本身、它的任务和里程碑的最新更新时间。
  // 早于活动日志上线的数据没有日志，靠 updated_at 兜底。
  const projectLastActive = (p: (typeof projectRows)[number]) =>
    latest(
      logged.get(p.id),
      p.updatedAt,
      ...taskRows.filter((t) => t.projectId === p.id).map((t) => t.updatedAt),
      ...milestoneRows.filter((m) => m.projectId === p.id).map((m) => m.updatedAt),
    );

  const thisWeek = isoWeekKey(today);
  const weekKeys = [shiftWeek(thisWeek, -1), thisWeek];
  const plans = db.select().from(weeklyPlans).where(inArray(weeklyPlans.weekKey, weekKeys)).all();
  const weekTaskCounts = db
    .select({ weekKey: tasks.weekKey })
    .from(tasks)
    .where(inArray(tasks.weekKey, weekKeys))
    .all();

  return {
    today,
    themes: themeRows.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      createdOn: toDateString(t.createdAt),
    })),
    projects: projectRows.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      themeId: p.themeId,
      lastActiveOn: toDateString(projectLastActive(p)),
    })),
    milestones: milestoneRows.map((m) => {
      const linked = taskRows.filter((t) => t.milestoneId === m.id);
      return {
        id: m.id,
        title: m.title,
        projectId: m.projectId,
        dueDate: m.dueDate,
        done: m.doneAt !== null,
        taskDone: linked.filter((t) => t.status === 'done').length,
        taskTotal: linked.length,
      };
    }),
    openTasks: taskRows
      .filter((t) => t.status !== 'done')
      .map((t) => ({ projectId: t.projectId, themeId: t.themeId, status: t.status })),
    weeks: weekKeys.map((weekKey) => {
      const plan = plans.find((p) => p.weekKey === weekKey);
      return {
        weekKey,
        hasPlan: (plan?.focus.length ?? 0) > 0,
        taskCount: weekTaskCounts.filter((t) => t.weekKey === weekKey).length,
        reviewed: plan?.reviewedAt != null,
      };
    }),
  };
}

/** 健康检查报告：按严重程度排好序的提醒列表。 */
export function getHealthReport(db: Conn, today: string): HealthReport {
  const issues = evaluateHealth(buildHealthSnapshot(db, today));
  return {
    today,
    issues,
    counts: {
      danger: issues.filter((i) => i.severity === 'danger').length,
      warning: issues.filter((i) => i.severity === 'warning').length,
      info: issues.filter((i) => i.severity === 'info').length,
    },
  };
}
