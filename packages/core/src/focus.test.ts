import { describe, expect, it } from 'vitest';
import {
  FOCUS_REMIND_EVERY_MS,
  focusAutoPaused,
  focusElapsedMs,
  focusPausedAt,
  focusReminderCount,
  focusRemainingMs,
  focusStretchMs,
  formatFocusClock,
  formatFocusDuration,
  type FocusTiming,
} from './focus.ts';

const START = new Date('2026-09-28T09:00:00Z');
const at = (min: number, sec = 0) => new Date(START.getTime() + min * 60_000 + sec * 1000);
const MIN = 60_000;
const HOUR = 60 * MIN;

const stopwatch: FocusTiming = {
  mode: 'stopwatch',
  startedAt: START,
  endedAt: null,
  plannedMinutes: null,
  pausedAt: null,
  pausedMs: 0,
  resumedAt: null,
};
const timer = (plannedMinutes: number): FocusTiming => ({ ...stopwatch, mode: 'timer', plannedMinutes });

describe('专心致志计时', () => {
  it('正计时：进行中按现在算，结束后按结束时刻算', () => {
    expect(focusElapsedMs(stopwatch, at(12, 5))).toBe(725_000);
    expect(focusElapsedMs({ ...stopwatch, endedAt: at(30) }, at(90))).toBe(30 * MIN);
    expect(focusRemainingMs(stopwatch, at(10))).toBeNull();
  });

  it('倒计时：剩余时间，到点后不再增加', () => {
    expect(focusRemainingMs(timer(25), at(10))).toBe(15 * MIN);
    expect(focusElapsedMs(timer(25), at(40))).toBe(25 * MIN);
    expect(focusRemainingMs(timer(25), at(40))).toBe(0);
    // 提前结束：按实际时长。
    expect(focusElapsedMs({ ...timer(25), endedAt: at(10) }, at(40))).toBe(10 * MIN);
    expect(focusRemainingMs({ ...timer(25), endedAt: at(10) }, at(40))).toBe(15 * MIN);
  });

  it('暂停中时长不增加；继续后扣掉暂停的时间', () => {
    // 9:00 开始，9:20 暂停
    const paused = { ...stopwatch, pausedAt: at(20) };
    expect(focusElapsedMs(paused, at(50))).toBe(20 * MIN);
    expect(focusPausedAt(paused, at(50))).toBe(at(20).getTime());
    expect(focusStretchMs(paused, at(50))).toBe(0);
    // 9:50 继续：暂停了 30 分钟
    const resumed = { ...stopwatch, pausedMs: 30 * MIN, resumedAt: at(50) };
    expect(focusElapsedMs(resumed, at(60))).toBe(30 * MIN);
    expect(focusStretchMs(resumed, at(60))).toBe(10 * MIN);
    // 暂停后直接结束：结束时把暂停时长计入累计
    expect(focusElapsedMs({ ...stopwatch, pausedMs: 30 * MIN, endedAt: at(50) }, at(90))).toBe(20 * MIN);
  });

  it('倒计时暂停：剩余时间停住，到点时刻顺延', () => {
    expect(focusRemainingMs({ ...timer(25), pausedAt: at(10) }, at(40))).toBe(15 * MIN);
    const resumed = { ...timer(25), pausedMs: 30 * MIN, resumedAt: at(40) };
    expect(focusRemainingMs(resumed, at(45))).toBe(10 * MIN);
    expect(focusElapsedMs(resumed, at(90))).toBe(25 * MIN);
  });

  it('正计时连续满 4 小时自动暂停：表盘停在 4 小时，继续后重新算', () => {
    expect(focusAutoPaused(stopwatch, at(239))).toBe(false);
    expect(focusAutoPaused(stopwatch, at(240))).toBe(true);
    expect(focusElapsedMs(stopwatch, at(300))).toBe(4 * HOUR);
    expect(focusPausedAt(stopwatch, at(300))).toBe(at(240).getTime());
    // 服务端记下的自动暂停（暂停起点正好在满 4 小时）也认作自动暂停
    expect(focusAutoPaused({ ...stopwatch, pausedAt: at(240) }, at(300))).toBe(true);
    // 手动暂停过的不算
    expect(focusAutoPaused({ ...stopwatch, pausedAt: at(100) }, at(300))).toBe(false);
    // 中途暂停过：从最近一次继续起重新算 4 小时
    const resumed = { ...stopwatch, pausedMs: 60 * MIN, resumedAt: at(180) };
    expect(focusAutoPaused(resumed, at(400))).toBe(false);
    expect(focusAutoPaused(resumed, at(420))).toBe(true);
    expect(focusElapsedMs(resumed, at(500))).toBe(6 * HOUR);
    // 倒计时不会自动暂停
    expect(focusAutoPaused(timer(600), at(300))).toBe(false);
  });

  it('每连续满两小时提醒一次', () => {
    expect(focusReminderCount(FOCUS_REMIND_EVERY_MS - 1)).toBe(0);
    expect(focusReminderCount(FOCUS_REMIND_EVERY_MS)).toBe(1);
    expect(focusReminderCount(focusStretchMs(stopwatch, at(130)))).toBe(1);
  });

  it('表盘与中文时长', () => {
    expect(formatFocusClock(65_000)).toBe('01:05');
    expect(formatFocusClock(3_909_000)).toBe('1:05:09');
    expect(formatFocusDuration(0)).toBe('0 分');
    expect(formatFocusDuration(40_000)).toBe('40 秒');
    expect(formatFocusDuration(25 * MIN + 59_000)).toBe('25 分');
    expect(formatFocusDuration(2 * HOUR)).toBe('2 小时');
    expect(formatFocusDuration(2 * HOUR + 5 * MIN)).toBe('2 小时 5 分');
  });
});
