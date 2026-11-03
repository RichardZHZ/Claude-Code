import { and, asc, desc, eq, gte, isNotNull, isNull, lt, type SQL } from 'drizzle-orm';
import type { FocusTargetInput, StartFocusInput } from '../contracts.ts';
import type { Conn } from '../db.ts';
import { invalid, notFound } from '../errors.ts';
import { focusAutoPauseAt, focusElapsedMs, focusPlannedEnd } from '../focus.ts';
import { focusSessions, themes, type FocusSession } from '../schema.ts';
import type { FocusSessionView, FocusState, FocusThemeTotal, RecapFocusByTheme } from '../types.ts';
import { addDays, isoWeekKey, startOfLocalDay, weekRange } from '../week.ts';
import type { ActivityAction } from '../enums.ts';
import type { ActivityPayload } from '../schema.ts';
import { logActivity } from './activity.ts';
import { getTheme } from './themes.ts';

// 专心致志：在某个议题下正计时或倒计时，可以暂停、继续，每一段都存档，按议题统计专注时间。
// 同一时间最多进行一段（含暂停中的，数据库有唯一索引兜底）。到点和自动暂停不依赖前端：
// 每次读写之前先调用 settleFocus，把已经到点的倒计时补上结束时刻，
// 把连续计时满 4 小时的正计时补上暂停起点。

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

function log(db: Conn, view: FocusSessionView, action: ActivityAction, extra: ActivityPayload = {}) {
  logActivity(db, {
    entityType: 'focus_session',
    entityId: view.id,
    action,
    themeId: view.themeId,
    payload: { title: view.themeTitle, mode: view.mode, durationMs: view.durationMs, ...extra },
  });
}

/**
 * 补记已经发生的变化：倒计时到点就结束（结束时刻取到点时刻）；正计时连续满 4 小时就暂停
 * （暂停起点取满 4 小时的时刻）。暂停中的不会到点，也不会再自动暂停。返回有变化的那一段。
 */
export function settleFocus(db: Conn, now: Date): FocusSessionView | null {
  const running = runningRow(db);
  if (!running || running.pausedAt !== null) return null;
  const plannedEnd = focusPlannedEnd(running);
  if (plannedEnd !== null && plannedEnd <= now.getTime()) {
    db.update(focusSessions)
      .set({ endedAt: new Date(plannedEnd) })
      .where(eq(focusSessions.id, running.id))
      .run();
    const view = getSessionView(db, running.id, now);
    log(db, view, 'completed');
    return view;
  }
  const autoPause = focusAutoPauseAt(running);
  if (autoPause !== null && autoPause <= now.getTime()) {
    db.update(focusSessions)
      .set({ pausedAt: new Date(autoPause) })
      .where(eq(focusSessions.id, running.id))
      .run();
    const view = getSessionView(db, running.id, now);
    log(db, view, 'paused', { auto: true });
    return view;
  }
  return null;
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
 * 找到要操作的那一段：先补记到点和自动暂停，再取进行中的一段。
 * 带上 id 而那一段已经结束（例如倒计时刚好到点）时返回 ended，调用方直接把它交回去，不报错。
 */
function target(
  db: Conn,
  input: FocusTargetInput,
  now: Date,
): { running: FocusSession } | { ended: FocusSessionView } {
  settleFocus(db, now);
  if (input.id !== undefined) {
    const view = getSessionView(db, input.id, now);
    if (view.endedAt !== null) return { ended: view };
  }
  const running = runningRow(db);
  if (!running) throw invalid('现在没有进行中的专注');
  return { running };
}

/** 暂停时长计入累计暂停：暂停中的一段在继续或结束时调用。 */
function foldPause(s: FocusSession, now: Date): number {
  return s.pausedMs + (s.pausedAt ? Math.max(0, now.getTime() - s.pausedAt.getTime()) : 0);
}

/** 结束进行中的专注并存档（暂停中的也可以直接结束）。 */
export function stopFocus(db: Conn, input: FocusTargetInput, now: Date): FocusSessionView {
  const found = target(db, input, now);
  if ('ended' in found) return found.ended;
  const { running } = found;
  db.update(focusSessions)
    .set({ endedAt: now, pausedAt: null, pausedMs: foldPause(running, now) })
    .where(eq(focusSessions.id, running.id))
    .run();
  const view = getSessionView(db, running.id, now);
  log(db, view, 'stopped');
  return view;
}

/** 暂停进行中的专注。已经在暂停的直接返回。 */
export function pauseFocus(db: Conn, input: FocusTargetInput, now: Date): FocusSessionView {
  const found = target(db, input, now);
  if ('ended' in found) return found.ended;
  const { running } = found;
  if (running.pausedAt !== null) return getSessionView(db, running.id, now);
  db.update(focusSessions).set({ pausedAt: now }).where(eq(focusSessions.id, running.id)).run();
  const view = getSessionView(db, running.id, now);
  log(db, view, 'paused');
  return view;
}

/** 继续暂停中的专注；正计时从这一刻重新算"连续 4 小时"。没在暂停的直接返回。 */
export function resumeFocus(db: Conn, input: FocusTargetInput, now: Date): FocusSessionView {
  const found = target(db, input, now);
  if ('ended' in found) return found.ended;
  const { running } = found;
  if (running.pausedAt === null) return getSessionView(db, running.id, now);
  db.update(focusSessions)
    .set({ pausedAt: null, pausedMs: foldPause(running, now), resumedAt: now })
    .where(eq(focusSessions.id, running.id))
    .run();
  const view = getSessionView(db, running.id, now);
  log(db, view, 'resumed');
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
