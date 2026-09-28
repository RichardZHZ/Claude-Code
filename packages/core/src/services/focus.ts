import { and, asc, desc, eq, gte, isNotNull, isNull, lt, type SQL } from 'drizzle-orm';
import type { StartFocusInput, StopFocusInput } from '../contracts.ts';
import type { Conn } from '../db.ts';
import { invalid, notFound } from '../errors.ts';
import { focusElapsedMs, focusPlannedEnd } from '../focus.ts';
import { focusSessions, themes, type FocusSession } from '../schema.ts';
import type { FocusSessionView, FocusState, FocusThemeTotal, RecapFocusByTheme } from '../types.ts';
import { addDays, isoWeekKey, startOfLocalDay, weekRange } from '../week.ts';
import { logActivity } from './activity.ts';
import { getTheme } from './themes.ts';

// 专心致志：在某个议题下正计时或倒计时，每一段都存档，按议题统计专注时间。
// 同一时间最多进行一段（数据库有唯一索引兜底）。倒计时到点不依赖前端：
// 每次读写之前先调用 settleFocus，把已经到点的倒计时补上结束时刻。

function views(db: Conn, where: SQL | undefined, now: Date, order: SQL[]): FocusSessionView[] {
  return db
    .select({ session: focusSessions, themeTitle: themes.title })
    .from(focusSessions)
    .innerJoin(themes, eq(focusSessions.themeId, themes.id))
    .where(where)
    .orderBy(...order)
    .all()
    .map(({ session, themeTitle }) => ({
      ...session,
      themeTitle,
      durationMs: focusElapsedMs(session, now),
    }));
}

function getSessionView(db: Conn, id: number, now: Date): FocusSessionView {
  const [view] = views(db, eq(focusSessions.id, id), now, []);
  if (!view) throw notFound('专注记录', id);
  return view;
}

function runningRow(db: Conn): FocusSession | undefined {
  return db.select().from(focusSessions).where(isNull(focusSessions.endedAt)).get();
}

/** 把已经到点的倒计时结束掉（结束时刻取设定的到点时刻）。返回被结束的那一段。 */
export function settleFocus(db: Conn, now: Date): FocusSessionView | null {
  const running = runningRow(db);
  const plannedEnd = running ? focusPlannedEnd(running) : null;
  if (!running || plannedEnd === null || plannedEnd > now.getTime()) return null;
  db.update(focusSessions)
    .set({ endedAt: new Date(plannedEnd) })
    .where(eq(focusSessions.id, running.id))
    .run();
  const view = getSessionView(db, running.id, now);
  logActivity(db, {
    entityType: 'focus_session',
    entityId: view.id,
    action: 'completed',
    themeId: view.themeId,
    payload: { title: view.themeTitle, mode: view.mode, durationMs: view.durationMs },
  });
  return view;
}

/** 开始专注。已经有进行中的一段时报错，需要先结束它。 */
export function startFocus(db: Conn, input: StartFocusInput, now: Date): FocusSessionView {
  settleFocus(db, now);
  const theme = getTheme(db, input.themeId);
  if (theme.status === 'closed') throw invalid(`议题"${theme.title}"已结束，不能再开始专注`);
  const running = runningRow(db);
  if (running) {
    const title = getSessionView(db, running.id, now).themeTitle;
    throw invalid(`"${title}"的专注还在进行，先结束它再开始新的`);
  }
  const row = db
    .insert(focusSessions)
    .values({
      themeId: theme.id,
      mode: input.mode,
      plannedMinutes: input.mode === 'timer' ? (input.plannedMinutes ?? null) : null,
      startedAt: now,
    })
    .returning()
    .get();
  logActivity(db, {
    entityType: 'focus_session',
    entityId: row.id,
    action: 'started',
    themeId: theme.id,
    payload: { title: theme.title, mode: row.mode, plannedMinutes: row.plannedMinutes },
  });
  return getSessionView(db, row.id, now);
}

/**
 * 结束进行中的专注并存档。带上 id 时，若那一段已经结束（例如倒计时刚好到点），
 * 直接返回它，不报错。
 */
export function stopFocus(db: Conn, input: StopFocusInput, now: Date): FocusSessionView {
  settleFocus(db, now);
  if (input.id !== undefined) {
    const target = getSessionView(db, input.id, now);
    if (target.endedAt !== null) return target;
  }
  const running = runningRow(db);
  if (!running) throw invalid('现在没有进行中的专注');
  db.update(focusSessions).set({ endedAt: now }).where(eq(focusSessions.id, running.id)).run();
  const view = getSessionView(db, running.id, now);
  logActivity(db, {
    entityType: 'focus_session',
    entityId: view.id,
    action: 'stopped',
    themeId: view.themeId,
    payload: { title: view.themeTitle, mode: view.mode, durationMs: view.durationMs },
  });
  return view;
}

/** 删除一段专注记录（误点时用）；删除进行中的一段等于放弃它，不存档。 */
export function deleteFocusSession(db: Conn, id: number, now: Date): void {
  const view = getSessionView(db, id, now);
  db.delete(focusSessions).where(eq(focusSessions.id, id)).run();
  logActivity(db, {
    entityType: 'focus_session',
    entityId: id,
    action: 'deleted',
    themeId: view.themeId,
    payload: { title: view.themeTitle, mode: view.mode, durationMs: view.durationMs },
  });
}

/** 在 [from, to) 之间开始的专注，按开始时刻先后。 */
export function listFocusSessions(db: Conn, from: Date, to: Date, now: Date): FocusSessionView[] {
  return views(db, and(gte(focusSessions.startedAt, from), lt(focusSessions.startedAt, to)), now, [
    asc(focusSessions.startedAt),
    asc(focusSessions.id),
  ]);
}

/** 按议题合计时长，时长长的在前。 */
export function sumFocusByTheme(sessions: FocusSessionView[]): RecapFocusByTheme[] {
  const byTheme = new Map<number, RecapFocusByTheme>();
  for (const s of sessions) {
    const entry = byTheme.get(s.themeId) ?? { themeId: s.themeId, title: s.themeTitle, ms: 0, sessions: 0 };
    entry.ms += s.durationMs;
    entry.sessions += 1;
    byTheme.set(s.themeId, entry);
  }
  return [...byTheme.values()].sort((a, b) => b.ms - a.ms || a.themeId - b.themeId);
}

/** 专心致志面板需要的全部数据：进行中的一段、今天/本周合计、各议题的累计时间。 */
export function getFocusState(db: Conn, today: string, now: Date): FocusState {
  settleFocus(db, now);
  const weekKey = isoWeekKey(today);
  const dayStart = startOfLocalDay(today).getTime();
  const dayEnd = startOfLocalDay(addDays(today, 1)).getTime();
  const weekStart = startOfLocalDay(weekRange(weekKey).start).getTime();
  const weekEnd = startOfLocalDay(addDays(weekRange(weekKey).end, 1)).getTime();

  const finished = views(db, isNotNull(focusSessions.endedAt), now, [desc(focusSessions.startedAt)]);
  const running = runningRow(db);

  const totals = new Map<number, FocusThemeTotal>();
  for (const t of db.select().from(themes).orderBy(asc(themes.id)).all()) {
    totals.set(t.id, {
      themeId: t.id,
      title: t.title,
      status: t.status,
      todayMs: 0,
      weekMs: 0,
      totalMs: 0,
      sessions: 0,
    });
  }
  let todayMs = 0;
  let weekMs = 0;
  for (const s of finished) {
    const start = s.startedAt.getTime();
    const entry = totals.get(s.themeId);
    const inToday = start >= dayStart && start < dayEnd;
    const inWeek = start >= weekStart && start < weekEnd;
    if (inToday) todayMs += s.durationMs;
    if (inWeek) weekMs += s.durationMs;
    if (!entry) continue;
    entry.totalMs += s.durationMs;
    entry.sessions += 1;
    if (inToday) entry.todayMs += s.durationMs;
    if (inWeek) entry.weekMs += s.durationMs;
  }
  const statusOrder = { active: 0, dormant: 1, closed: 2 } as const;
  const themeTotals = [...totals.values()]
    .filter((t) => t.status !== 'closed' || t.sessions > 0 || t.themeId === running?.themeId)
    .sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || a.themeId - b.themeId);

  return {
    today,
    weekKey,
    running: running ? getSessionView(db, running.id, now) : null,
    todayMs,
    weekMs,
    themes: themeTotals,
    todaySessions: views(
      db,
      and(gte(focusSessions.startedAt, new Date(dayStart)), lt(focusSessions.startedAt, new Date(dayEnd))),
      now,
      [desc(focusSessions.startedAt), desc(focusSessions.id)],
    ),
  };
}
