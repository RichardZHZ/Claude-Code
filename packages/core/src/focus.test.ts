import { describe, expect, it } from 'vitest';
import {
  FOCUS_REMIND_EVERY_MS,
  focusElapsedMs,
  focusReminderCount,
  focusRemainingMs,
  formatFocusClock,
  formatFocusDuration,
} from './focus.ts';

const START = new Date('2026-09-28T09:00:00Z');
const at = (min: number, sec = 0) => new Date(START.getTime() + min * 60_000 + sec * 1000);

describe('专心致志计时', () => {
  it('正计时：进行中按现在算，结束后按结束时刻算', () => {
    const s = { mode: 'stopwatch' as const, startedAt: START, endedAt: null, plannedMinutes: null };
    expect(focusElapsedMs(s, at(12, 5))).toBe(725_000);
    expect(focusElapsedMs({ ...s, endedAt: at(30) }, at(90))).toBe(30 * 60_000);
    expect(focusRemainingMs(s, at(10))).toBeNull();
  });

  it('倒计时：剩余时间，到点后不再增加', () => {
    const s = { mode: 'timer' as const, startedAt: START, endedAt: null, plannedMinutes: 25 };
    expect(focusRemainingMs(s, at(10))).toBe(15 * 60_000);
    expect(focusElapsedMs(s, at(40))).toBe(25 * 60_000);
    expect(focusRemainingMs(s, at(40))).toBe(0);
    // 提前结束：按实际时长。
    expect(focusElapsedMs({ ...s, endedAt: at(10) }, at(40))).toBe(10 * 60_000);
    expect(focusRemainingMs({ ...s, endedAt: at(10) }, at(40))).toBe(15 * 60_000);
  });

  it('每满两小时提醒一次', () => {
    expect(focusReminderCount(FOCUS_REMIND_EVERY_MS - 1)).toBe(0);
    expect(focusReminderCount(FOCUS_REMIND_EVERY_MS)).toBe(1);
    expect(focusReminderCount(2 * FOCUS_REMIND_EVERY_MS + 5)).toBe(2);
  });

  it('表盘与中文时长', () => {
    expect(formatFocusClock(65_000)).toBe('01:05');
    expect(formatFocusClock(3_909_000)).toBe('1:05:09');
    expect(formatFocusDuration(0)).toBe('0 分');
    expect(formatFocusDuration(40_000)).toBe('40 秒');
    expect(formatFocusDuration(25 * 60_000 + 59_000)).toBe('25 分');
    expect(formatFocusDuration(2 * 3_600_000)).toBe('2 小时');
    expect(formatFocusDuration(2 * 3_600_000 + 5 * 60_000)).toBe('2 小时 5 分');
  });
});
