import { and, asc, eq, gte, inArray, lt, ne } from 'drizzle-orm';
import type { Conn } from '../db.ts';
import { dailyPlans, tasks } from '../schema.ts';
import type { RecapDay, WeekRecap } from '../types.ts';
import { addDays, shiftWeek, startOfLocalDay, weekRange } from '../week.ts';
import { listFocusSessions, settleFocus, sumFocusByTheme } from './focus.ts';
import { queryTaskViews } from './tasks.ts';

// 回顾：不写复盘，只把每天实际发生的事列出来（完成的任务、当天最重要的事、
// 没做完的安排、专注时间）。全部由现有数据推出，不另外存库。

/** 某一天的回顾。时间戳按本机时区的日历日归属；跨过午夜的专注记在开始的那天。 */
export function getRecapDay(db: Conn, date: string, now: Date): RecapDay {
  const from = startOfLocalDay(date);
  const to = startOfLocalDay(addDays(date, 1));
  const plan = db.select().from(dailyPlans).where(eq(dailyPlans.date, date)).get();
  const topIds = plan?.topTaskIds ?? [];
  const topViews = topIds.length > 0 ? queryTaskViews(db, inArray(tasks.id, topIds)) : [];
  const focusSessions = listFocusSessions(db, from, to, now);

  return {
    date,
    topTasks: topIds.map((id) => topViews.find((t) => t.id === id)).filter((t) => t !== undefined),
    completed: queryTaskViews(
      db,
      and(eq(tasks.status, 'done'), gte(tasks.doneAt, from), lt(tasks.doneAt, to)),
      [asc(tasks.doneAt), asc(tasks.id)],
    ),
    unfinished: queryTaskViews(db, and(eq(tasks.scheduledDate, date), ne(tasks.status, 'done'))),
    focusMs: focusSessions.reduce((sum, s) => sum + s.durationMs, 0),
    focusByTheme: sumFocusByTheme(focusSessions),
    focusSessions,
  };
}

/** 一周七天的回顾，外加整周的完成数和专注合计。 */
export function getWeekRecap(db: Conn, weekKey: string, now: Date): WeekRecap {
  const { start, end } = weekRange(weekKey);
  settleFocus(db, now);
  const days = Array.from({ length: 7 }, (_, i) => getRecapDay(db, addDays(start, i), now));
  const sessions = days.flatMap((d) => d.focusSessions);
  return {
    weekKey,
    start,
    end,
    prevWeek: shiftWeek(weekKey, -1),
    nextWeek: shiftWeek(weekKey, 1),
    days,
    completedCount: days.reduce((sum, d) => sum + d.completed.length, 0),
    focusMs: sessions.reduce((sum, s) => sum + s.durationMs, 0),
    focusByTheme: sumFocusByTheme(sessions),
  };
}
