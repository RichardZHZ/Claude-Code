import { and, asc, eq, inArray, isNull, lte, ne, notInArray } from 'drizzle-orm';
import type { DayPlanInput, WeekPlanInput } from '../contracts.ts';
import type { Conn } from '../db.ts';
import { CLOSED_PROJECT_STATUSES } from '../enums.ts';
import { invalid } from '../errors.ts';
import { dailyPlans, milestones, projects, tasks, weeklyPlans } from '../schema.ts';
import type { DayView, WeekView } from '../types.ts';
import { addDays, isoWeekKey, shiftWeek, weekRange } from '../week.ts';
import { logActivity } from './activity.ts';
import { literatureLinkedInWeek } from './resources.ts';
import {
  projectStillOpen,
  queryTaskViews,
  unfinishedBeforeDate,
  unfinishedBeforeWeek,
  updateTask,
} from './tasks.ts';

// ---------- 周 ----------

export function getWeekView(db: Conn, weekKey: string): WeekView {
  const { start, end } = weekRange(weekKey);
  const plan = db.select().from(weeklyPlans).where(eq(weeklyPlans.weekKey, weekKey)).get();

  const milestonesDue = db
    .select({ milestone: milestones, projectTitle: projects.title })
    .from(milestones)
    .innerJoin(projects, eq(milestones.projectId, projects.id))
    .where(
      and(
        isNull(milestones.doneAt),
        lte(milestones.dueDate, end),
        notInArray(projects.status, [...CLOSED_PROJECT_STATUSES]),
      ),
    )
    .orderBy(asc(milestones.dueDate), asc(milestones.id))
    .all()
    .map((r) => ({ ...r.milestone, projectTitle: r.projectTitle }));

  return {
    weekKey,
    start,
    end,
    prevWeek: shiftWeek(weekKey, -1),
    nextWeek: shiftWeek(weekKey, 1),
    plan: { focus: plan?.focus ?? [] },
    tasks: queryTaskViews(db, eq(tasks.weekKey, weekKey)),
    carryOver: unfinishedBeforeWeek(db, weekKey),
    backlog: queryTaskViews(db, and(isNull(tasks.weekKey), ne(tasks.status, 'done'), projectStillOpen)),
    milestonesDue,
    literature: literatureLinkedInWeek(db, weekKey),
  };
}

export function saveWeekPlan(db: Conn, weekKey: string, input: WeekPlanInput): WeekView {
  weekRange(weekKey);
  const plan = db
    .insert(weeklyPlans)
    .values({ weekKey, focus: input.focus })
    .onConflictDoUpdate({ target: weeklyPlans.weekKey, set: { focus: input.focus, updatedAt: new Date() } })
    .returning({ id: weeklyPlans.id })
    .get();
  logActivity(db, { entityType: 'weekly_plan', entityId: plan.id, action: 'planned', payload: { weekKey } });
  return getWeekView(db, weekKey);
}

// ---------- 日 ----------

export function getDayView(db: Conn, date: string): DayView {
  const weekKey = isoWeekKey(date);
  const plan = db.select().from(dailyPlans).where(eq(dailyPlans.date, date)).get();
  const today = queryTaskViews(db, eq(tasks.scheduledDate, date));

  // 只保留仍排在当天的"最重要的事"：任务被移走或删除后自动消失。
  const topTasks = (plan?.topTaskIds ?? [])
    .map((id) => today.find((t) => t.id === id))
    .filter((t) => t !== undefined);
  const topIds = new Set(topTasks.map((t) => t.id));

  return {
    date,
    weekKey,
    prevDate: addDays(date, -1),
    nextDate: addDays(date, 1),
    plan: { topTaskIds: topTasks.map((t) => t.id) },
    topTasks,
    scheduled: today.filter((t) => !topIds.has(t.id)),
    carryOver: unfinishedBeforeDate(db, date),
    weekPool: queryTaskViews(
      db,
      and(eq(tasks.weekKey, weekKey), isNull(tasks.scheduledDate), ne(tasks.status, 'done')),
    ),
  };
}

/** 保存当天最重要的事。选中的任务会被自动排到这一天。 */
export function saveDayPlan(db: Conn, date: string, input: DayPlanInput): DayView {
  isoWeekKey(date);
  const ids = input.topTaskIds;
  db.transaction((tx) => {
    if (ids.length > 0) {
      const found = tx
        .select({ id: tasks.id, scheduledDate: tasks.scheduledDate })
        .from(tasks)
        .where(inArray(tasks.id, ids))
        .all();
      const missing = ids.filter((id) => !found.some((f) => f.id === id));
      if (missing.length > 0) throw invalid(`任务不存在：${missing.join('、')}`);
      // 经由 updateTask 排期，保证排期规则一致并记入活动日志。
      for (const t of found) {
        if (t.scheduledDate !== date) updateTask(tx, t.id, { scheduledDate: date });
      }
    }

    const plan = tx
      .insert(dailyPlans)
      .values({ date, topTaskIds: ids })
      .onConflictDoUpdate({ target: dailyPlans.date, set: { topTaskIds: ids, updatedAt: new Date() } })
      .returning({ id: dailyPlans.id })
      .get();
    logActivity(tx, { entityType: 'daily_plan', entityId: plan.id, action: 'planned', payload: { date } });
  });
  return getDayView(db, date);
}
