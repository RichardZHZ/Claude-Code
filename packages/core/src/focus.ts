// 专心致志的计时计算：纯函数，前端（按秒刷新）、服务层和 MCP 共用。
//
// 一段专注可以暂停、继续多次：paused_ms 累计已经暂停过的时长，paused_at 是正在暂停的起点，
// resumed_at 是最近一次继续的时刻（没继续过就是开始时刻）。专注时长 = 结束（或现在、或暂停起点）
// − 开始 − 累计暂停。正计时从开始或最近一次继续起连续满 4 小时自动暂停；这里按"已经暂停"计算，
// 不用等服务端记下来，表盘在 4:00:00 停住。

import type { FocusMode } from './enums.ts';

/** 正计时每连续进行这么久，提醒一次。 */
export const FOCUS_REMIND_EVERY_MS = 2 * 3_600_000;
/** 正计时连续进行这么久（中间没有暂停），自动暂停。 */
export const FOCUS_AUTO_PAUSE_MS = 4 * 3_600_000;

type Instant = Date | string | number;

export type FocusTiming = {
  mode: FocusMode;
  startedAt: Instant;
  endedAt: Instant | null;
  plannedMinutes: number | null;
  /** 正在暂停的起点；没有暂停为 null。 */
  pausedAt: Instant | null;
  /** 已经暂停过的总时长（毫秒），不含正在进行的这次暂停。 */
  pausedMs: number;
  /** 最近一次继续的时刻；没暂停过为 null。 */
  resumedAt: Instant | null;
};

const ms = (t: Instant) => new Date(t).getTime();

/** 当前这一段连续计时从什么时候开始：最近一次继续，没继续过就是开始时刻。 */
export function focusStretchStart(s: FocusTiming): number {
  return ms(s.resumedAt ?? s.startedAt);
}

/** 正计时连续满 4 小时自动暂停的时刻；倒计时为 null。 */
export function focusAutoPauseAt(s: FocusTiming): number | null {
  return s.mode === 'stopwatch' ? focusStretchStart(s) + FOCUS_AUTO_PAUSE_MS : null;
}

/**
 * 实际生效的暂停起点：手动暂停的取 paused_at；正计时连续满 4 小时、服务端还没来得及记下的，
 * 按自动暂停的时刻算。没在暂停（或已经结束）为 null。
 */
export function focusPausedAt(s: FocusTiming, now: Instant = Date.now()): number | null {
  if (s.endedAt !== null) return null;
  if (s.pausedAt !== null) return ms(s.pausedAt);
  const auto = focusAutoPauseAt(s);
  return auto !== null && auto <= ms(now) ? auto : null;
}

/** 是不是因为连续计时满 4 小时而自动暂停的。 */
export function focusAutoPaused(s: FocusTiming, now: Instant = Date.now()): boolean {
  const paused = focusPausedAt(s, now);
  const auto = focusAutoPauseAt(s);
  return paused !== null && auto !== null && paused >= auto;
}

/** 倒计时（在不再暂停的前提下）到点的时刻；正计时为 null。 */
export function focusPlannedEnd(s: FocusTiming): number | null {
  return s.mode === 'timer' && s.plannedMinutes
    ? ms(s.startedAt) + s.plannedMinutes * 60_000 + s.pausedMs
    : null;
}

/** 已经专注了多久（毫秒），不含暂停的时间。进行中的按 now 计算；倒计时不超过设定时长。 */
export function focusElapsedMs(s: FocusTiming, now: Instant = Date.now()): number {
  const end = s.endedAt !== null ? ms(s.endedAt) : (focusPausedAt(s, now) ?? ms(now));
  const active = end - ms(s.startedAt) - s.pausedMs;
  const planned = s.mode === 'timer' && s.plannedMinutes ? s.plannedMinutes * 60_000 : Infinity;
  return Math.max(0, Math.min(active, planned));
}

/** 倒计时还剩多久（毫秒，不小于 0）；正计时为 null。 */
export function focusRemainingMs(s: FocusTiming, now: Instant = Date.now()): number | null {
  if (s.mode !== 'timer' || !s.plannedMinutes) return null;
  return Math.max(0, s.plannedMinutes * 60_000 - focusElapsedMs(s, now));
}

/** 当前这一段连续计时进行了多久（毫秒）；暂停中、已结束为 0。 */
export function focusStretchMs(s: FocusTiming, now: Instant = Date.now()): number {
  if (s.endedAt !== null || focusPausedAt(s, now) !== null) return 0;
  return Math.max(0, ms(now) - focusStretchStart(s));
}

/** 连续计时已经跨过了几个"两小时"，用来决定是否该提醒、提醒过几次。 */
export function focusReminderCount(stretchMs: number): number {
  return Math.floor(Math.max(0, stretchMs) / FOCUS_REMIND_EVERY_MS);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 计时器表盘：'1:05:09'，不足一小时为 '05:09'。 */
export function formatFocusClock(elapsedMs: number): string {
  const total = Math.floor(Math.max(0, elapsedMs) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** 时长的中文说法：'2 小时 5 分'、'25 分'、'40 秒'、'0 分'。 */
export function formatFocusDuration(elapsedMs: number): string {
  const total = Math.floor(Math.max(0, elapsedMs) / 1000);
  if (total > 0 && total < 60) return `${total} 秒`;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  if (h === 0) return `${m} 分`;
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分`;
}
