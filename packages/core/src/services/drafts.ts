// 计划与复盘的草稿：用确定性规则挑任务、写要点，每条建议都附上理由。
// Claude（或其他调用方）只负责把草稿润色成自然的文字，并在用户确认后再保存。

import { and, eq, gte, isNull, lt, lte, notInArray } from 'drizzle-orm';
import type { Conn } from '../db.ts';
import { CLOSED_PROJECT_STATUSES, MAX_TOP_TASKS, MAX_WEEK_FOCUS } from '../enums.ts';
import { activityLog, dailyPlans, milestones, projects, weeklyPlans } from '../schema.ts';
import type {
  DayPlanDraft,
  DraftTask,
  MilestoneDue,
  TaskView,
  WeekPlanDraft,
  WeekReviewDraft,
} from '../types.ts';
import { addDays, daysBetween, shiftWeek, startOfLocalDay, weekRange } from '../week.ts';
import { HEALTH_THRESHOLDS } from '../rules/health.ts';
import { buildHealthSnapshot, getHealthReport } from './health.ts';
import { getDayView, getWeekView } from './plans.ts';

function monthDay(date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

/** 评分用到的上下文。 */
type ScoreContext = {
  today: string;
  milestoneById: Map<number, { title: string; dueDate: string | null; done: boolean }>;
  projectById: Map<number, { title: string; status: string; deadline: string | null }>;
  staleProjects: Map<number, number>;
  /** 日计划时的日期；周计划时为 undefined。 */
  date?: string;
  weekKey: string;
};

/** 给一个任务打分并写出理由。分数只用于排序。 */
export function scoreTask(task: TaskView, ctx: ScoreContext): DraftTask {
  let score = 0;
  const reasons: string[] = [];

  if (task.priority === 1) {
    score += 30;
    reasons.push('高优先级');
  } else if (task.priority === 2) {
    score += 10;
  }

  if (task.status === 'doing') {
    score += 25;
    reasons.push('已经在做');
  } else if (task.status === 'blocked') {
    score -= 20;
    reasons.push('受阻中，先解决阻碍');
  }

  const m = task.milestoneId ? ctx.milestoneById.get(task.milestoneId) : undefined;
  if (m && !m.done && m.dueDate) {
    const days = daysBetween(ctx.today, m.dueDate);
    if (days < 0) {
      score += 40;
      reasons.push(`里程碑"${m.title}"已逾期 ${-days} 天`);
    } else if (days <= 7) {
      score += 30;
      reasons.push(`里程碑"${m.title}"${monthDay(m.dueDate)}到期`);
    } else if (days <= 14) {
      score += 15;
      reasons.push(`里程碑"${m.title}"两周内到期`);
    }
  }

  const p = task.projectId ? ctx.projectById.get(task.projectId) : undefined;
  if (p) {
    if (p.deadline) {
      const days = daysBetween(ctx.today, p.deadline);
      if (days >= 0 && days <= 14) {
        score += 20;
        reasons.push(`课题${monthDay(p.deadline)}截止`);
      }
    }
    if (p.status === 'paused') {
      score -= 15;
      reasons.push('课题暂停中');
    }
    const idle = ctx.staleProjects.get(task.projectId!);
    if (idle) {
      score += 10;
      reasons.push(`课题已 ${idle} 天没有进展`);
    }
  }

  if (ctx.date) {
    if (task.scheduledDate === ctx.date) {
      score += 20;
      reasons.push('已排在这一天');
    } else if (task.scheduledDate && task.scheduledDate < ctx.date) {
      score += 15;
      reasons.push(`从${monthDay(task.scheduledDate)}延续下来`);
    }
  } else if (task.weekKey && task.weekKey < ctx.weekKey) {
    score += 15;
    reasons.push(`${task.weekKey} 没做完`);
  }

  return { task, score, reasons };
}

function rank(items: DraftTask[]): DraftTask[] {
  return [...items].sort((a, b) => b.score - a.score || a.task.id - b.task.id);
}

function buildContext(db: Conn, today: string, weekKey: string, date?: string): ScoreContext {
  const ms = db.select().from(milestones).all();
  const ps = db.select().from(projects).all();
  // 与健康检查同一口径：进行中的课题超过阈值天数没有活动，视为停滞。
  const stale = new Map<number, number>();
  for (const p of buildHealthSnapshot(db, today).projects) {
    const idle = daysBetween(p.lastActiveOn, today);
    if (p.status === 'active' && idle > HEALTH_THRESHOLDS.staleDays) stale.set(p.id, idle);
  }
  return {
    today,
    weekKey,
    date,
    milestoneById: new Map(
      ms.map((m) => [m.id, { title: m.title, dueDate: m.dueDate, done: m.doneAt !== null }]),
    ),
    projectById: new Map(ps.map((p) => [p.id, { title: p.title, status: p.status, deadline: p.deadline }])),
    staleProjects: stale,
  };
}

/** 截至某天到期、尚未完成的里程碑（只看未结束的课题）。 */
function openMilestonesDueBy(db: Conn, until: string): MilestoneDue[] {
  return db
    .select({ milestone: milestones, projectTitle: projects.title })
    .from(milestones)
    .innerJoin(projects, eq(milestones.projectId, projects.id))
    .where(
      and(
        isNull(milestones.doneAt),
        lte(milestones.dueDate, until),
        notInArray(projects.status, [...CLOSED_PROJECT_STATUSES]),
      ),
    )
    .orderBy(milestones.dueDate, milestones.id)
    .all()
    .map((r) => ({ ...r.milestone, projectTitle: r.projectTitle }));
}

// ---------- 周计划草稿 ----------

export function draftWeekPlan(db: Conn, weekKey: string, today: string): WeekPlanDraft {
  const week = getWeekView(db, weekKey);
  const nextWeekEnd = weekRange(shiftWeek(weekKey, 1)).end;
  const ctx = buildContext(db, today, weekKey);
  const upcoming = openMilestonesDueBy(db, nextWeekEnd);

  // 候选：之前几周没做完的 + 待办池。已经在本周的不再建议。
  const candidates = rank([...week.carryOver, ...week.backlog].map((t) => scoreTask(t, ctx))).slice(0, 12);

  const focus: string[] = [];
  const add = (line: string) => {
    if (focus.length < MAX_WEEK_FOCUS && !focus.includes(line)) focus.push(line);
  };
  const lastPlan = db
    .select()
    .from(weeklyPlans)
    .where(eq(weeklyPlans.weekKey, shiftWeek(weekKey, -1)))
    .get();
  for (const line of lastPlan?.review?.carryOver ?? []) add(`${line}（上周带入）`);
  const mentionedProjects = new Set<number>();
  for (const m of upcoming) {
    const when = m.dueDate! <= week.end ? `${monthDay(m.dueDate!)}到期` : `下周${monthDay(m.dueDate!)}到期`;
    add(`${m.dueDate! <= week.end ? '完成' : '推进'}里程碑"${m.title}"（${m.projectTitle}，${when}）`);
    mentionedProjects.add(m.projectId);
  }
  const activeProjects = db
    .select()
    .from(projects)
    .where(eq(projects.status, 'active'))
    .orderBy(projects.priority, projects.deadline, projects.id)
    .all();
  for (const p of activeProjects) {
    if (mentionedProjects.has(p.id)) continue;
    if (p.deadline && daysBetween(today, p.deadline) >= 0 && daysBetween(today, p.deadline) <= 30) {
      add(`推进课题"${p.title}"（${monthDay(p.deadline)}截止）`);
      mentionedProjects.add(p.id);
    }
  }
  for (const p of activeProjects) {
    if (!mentionedProjects.has(p.id) && p.priority === 1) add(`推进课题"${p.title}"`);
  }

  return {
    weekKey,
    start: week.start,
    end: week.end,
    currentFocus: week.plan.focus,
    suggestedFocus: focus,
    alreadyPlanned: week.tasks,
    suggestedTasks: candidates,
    milestones: upcoming,
    issues: getHealthReport(db, today).issues.filter((i) => i.severity !== 'info'),
  };
}

// ---------- 日计划草稿 ----------

export function draftDayPlan(db: Conn, date: string, today: string = date): DayPlanDraft {
  const day = getDayView(db, date);
  const ctx = buildContext(db, today, day.weekKey, date);
  const pool = [...day.topTasks, ...day.scheduled, ...day.carryOver, ...day.weekPool].filter(
    (t, i, all) => t.status !== 'done' && all.findIndex((x) => x.id === t.id) === i,
  );
  const ranked = rank(pool.map((t) => scoreTask(t, ctx)));
  const top = ranked.filter((d) => d.task.status !== 'blocked').slice(0, MAX_TOP_TASKS);
  const topIds = new Set(top.map((d) => d.task.id));
  return {
    date,
    weekKey: day.weekKey,
    currentTopTaskIds: day.plan.topTaskIds,
    suggestedTop: top,
    otherCandidates: ranked.filter((d) => !topIds.has(d.task.id)).slice(0, 7),
    doneToday: [...day.topTasks, ...day.scheduled].filter((t) => t.status === 'done'),
  };
}

// ---------- 周复盘草稿 ----------

export function draftWeekReview(db: Conn, weekKey: string): WeekReviewDraft {
  const week = getWeekView(db, weekKey);
  const from = startOfLocalDay(week.start);
  const to = startOfLocalDay(addDays(week.end, 1));
  const done = week.tasks.filter((t) => t.status === 'done');
  const open = week.tasks.filter((t) => t.status !== 'done');

  const milestonesCompleted = db
    .select({ payload: activityLog.payload })
    .from(activityLog)
    .where(
      and(
        eq(activityLog.entityType, 'milestone'),
        eq(activityLog.action, 'completed'),
        gte(activityLog.at, from),
        lt(activityLog.at, to),
      ),
    )
    .all()
    .map((r) => r.payload?.title)
    .filter((t): t is string => typeof t === 'string');

  const dayBlockers = db
    .select({ date: dailyPlans.date, review: dailyPlans.review })
    .from(dailyPlans)
    .where(and(gte(dailyPlans.date, week.start), lte(dailyPlans.date, week.end)))
    .orderBy(dailyPlans.date)
    .all()
    .filter((d) => d.review?.blockers?.trim())
    .map((d) => `${monthDay(d.date)}：${d.review!.blockers.trim()}`);

  const context = (t: TaskView) => t.projectTitle ?? (t.themeTitle ? `议题 ${t.themeTitle}` : '');
  const literature = week.literature.map((r) => r.label ?? r.ref);

  const wins = [
    ...milestonesCompleted.map((m) => `达成里程碑"${m}"`),
    ...done.map((t) => `完成"${t.title}"（${context(t)}）`),
  ];
  if (literature.length > 0) wins.push(`关联了 ${literature.length} 篇文献`);

  return {
    weekKey,
    start: week.start,
    end: week.end,
    focus: week.plan.focus,
    stats: { done: done.length, total: week.tasks.length },
    milestonesCompleted,
    literature,
    existingReview: week.plan.review,
    suggested: {
      wins,
      blockers: [
        ...open.filter((t) => t.status === 'blocked').map((t) => `"${t.title}"受阻`),
        ...dayBlockers,
      ],
      carryOver: open.filter((t) => t.status !== 'blocked').map((t) => t.title),
      reflection: '',
    },
  };
}
