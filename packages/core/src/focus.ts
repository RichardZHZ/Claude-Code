// 专心致志的计时计算：纯函数，前端（按秒刷新）、服务层和 MCP 共用。

import type { FocusMode } from './enums.ts';

/** 正计时每连续进行这么久，提醒一次（不会自动停止）。 */
export const FOCUS_REMIND_EVERY_MS = 2 * 3_600_000;

type Instant = Date | string | number;

export type FocusTiming = {
  mode: FocusMode;
  startedAt: Instant;
  endedAt: Instant | null;
  plannedMinutes: number | null;
};

const ms = (t: Instant) => new Date(t).getTime();

/** 倒计时设定的结束时刻；正计时为 null。 */
export function focusPlannedEnd(s: FocusTiming): number | null {
  return s.mode === 'timer' && s.plannedMinutes ? ms(s.startedAt) + s.plannedMinutes * 60_000 : null;
}

/** 已经专注了多久（毫秒）。进行中的按 now 计算；倒计时不超过设定时长。 */
export function focusElapsedMs(s: FocusTiming, now: Instant = Date.now()): number {
  const end = s.endedAt === null ? ms(now) : ms(s.endedAt);
  const planned = focusPlannedEnd(s);
  return Math.max(0, Math.min(end, planned ?? end) - ms(s.startedAt));
}

/** 倒计时还剩多久（毫秒，不小于 0）；正计时为 null。 */
export function focusRemainingMs(s: FocusTiming, now: Instant = Date.now()): number | null {
  const planned = focusPlannedEnd(s);
  if (planned === null) return null;
  const end = s.endedAt === null ? ms(now) : Math.min(ms(s.endedAt), planned);
  return Math.max(0, planned - end);
}

/** 正计时已经跨过了几个"两小时"，用来决定是否该提醒、提醒过几次。 */
export function focusReminderCount(elapsedMs: number): number {
  return Math.floor(Math.max(0, elapsedMs) / FOCUS_REMIND_EVERY_MS);
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
