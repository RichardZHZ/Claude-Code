import { and, asc, eq, inArray, isNull, lte, ne, notInArray, sql } from 'drizzle-orm';
import type { DayPlanInput, DayReviewInput, WeekPlanInput, WeekReviewInput } from '../contracts.ts';
import type { Conn } from '../db.ts';
import { CLOSED_PROJECT_STATUSES } from '../enums.ts';
import { invalid } from '../errors.ts';
import { dailyPlans, milestones, projects, tasks, weeklyPlans } from '../schema.ts';
import type { DayView, WeekView } from '../types.ts';
import { addDays, isoWeekKey, shiftWeek, weekRange } from '../week.ts';
import { projectStillOpen, queryTaskViews, unfinishedBeforeDate, unfinishedBeforeWeek } from './tasks.ts';

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
    plan: {
      focus: plan?.focus ?? [],
      review: plan?.review ?? null,
      reviewedAt: plan?.reviewedAt ?? null,
    },
    tasks: queryTaskViews(db, eq(tasks.weekKey, weekKey)),
    carryOver: unfinishedBeforeWeek(db, weekKey),
    backlog: queryTaskViews(db, and(isNull(tasks.weekKey), ne(tasks.status, 'done'), projectStillOpen)),
    milestonesDue,
  };
}

export function saveWeekPlan(db: Conn, weekKey: string, input: WeekPlanInput): WeekView {
  weekRange(weekKey);
  db.insert(weeklyPlans)
    .values({ weekKey, focus: input.focus })
    .onConflictDoUpdate({ target: weeklyPlans.weekKey, set: { focus: input.focus, updatedAt: new Date() } })
    .run();
  return getWeekView(db, weekKey);
}

export function saveWeekReview(db: Conn, weekKey: string, review: WeekReviewInput): WeekView {
  weekRange(weekKey);
  const now = new Date();
  db.insert(weeklyPlans)
    .values({ weekKey, review, reviewedAt: now })
    .onConflictDoUpdate({ target: weeklyPlans.weekKey, set: { review, reviewedAt: now, updatedAt: now } })
    .run();
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
    plan: {
      topTaskIds: topTasks.map((t) => t.id),
      journal: plan?.journal ?? null,
      review: plan?.review ?? null,
      reviewedAt: plan?.reviewedAt ?? null,
    },
    topTasks,
    scheduled: today.filter((t) => !topIds.has(t.id)),
    carryOver: unfinishedBeforeDate(db, date),
    weekPool: queryTaskViews(
      db,
      and(eq(tasks.weekKey, weekKey), isNull(tasks.scheduledDate), ne(tasks.status, 'done')),
    ),
  };
}

/**
 * 保存日计划。设为"最重要的事"的任务会被自动排到这一天。
 * 只传 journal 时不改动最重要的事，反之亦然。
 */
export function saveDayPlan(db: Conn, date: string, input: DayPlanInput): DayView {
  const weekKey = isoWeekKey(date);
  db.transaction((tx) => {
    const set: { topTaskIds?: number[]; journal?: string | null } = {};

    if (input.topTaskIds !== undefined) {
      const ids = input.topTaskIds;
      if (ids.length > 0) {
        const found = tx.select({ id: tasks.id }).from(tasks).where(inArray(tasks.id, ids)).all();
        const missing = ids.filter((id) => !found.some((f) => f.id === id));
        if (missing.length > 0) throw invalid(`任务不存在：${missing.join('、')}`);
        tx.update(tasks)
          .set({ scheduledDate: date, weekKey })
          .where(and(inArray(tasks.id, ids), sql`${tasks.scheduledDate} is not ${date}`))
          .run();
      }
      set.topTaskIds = ids;
    }
    if (input.journal !== undefined) set.journal = input.journal;
    if (Object.keys(set).length === 0) return;

    tx.insert(dailyPlans)
      .values({ date, ...set })
      .onConflictDoUpdate({ target: dailyPlans.date, set: { ...set, updatedAt: new Date() } })
      .run();
  });
  return getDayView(db, date);
}

export function saveDayReview(db: Conn, date: string, review: DayReviewInput): DayView {
  isoWeekKey(date);
  const now = new Date();
  db.insert(dailyPlans)
    .values({ date, review, reviewedAt: now })
    .onConflictDoUpdate({ target: dailyPlans.date, set: { review, reviewedAt: now, updatedAt: now } })
    .run();
  return getDayView(db, date);
}
