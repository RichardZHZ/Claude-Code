import { describe, expect, it } from 'vitest';
import { countdownParts, describeCountdown, formatCountdownClock } from './countdown.ts';

const NOW = new Date('2026-09-28T10:00:00Z');

describe('倒计时', () => {
  it('拆成天、时、分、秒', () => {
    const p = countdownParts('2026-10-10T13:25:41Z', NOW);
    expect(p).toEqual({
      expired: false,
      days: 12,
      hours: 3,
      minutes: 25,
      seconds: 41,
      totalSeconds: 1_049_141,
    });
    expect(formatCountdownClock(p)).toBe('12 天 03:25:41');
    expect(describeCountdown('2026-10-10T13:25:41Z', NOW)).toBe('还剩 12 天 3 小时 25 分 41 秒');
  });

  it('不足一天时只显示时分秒；不足一秒向上取整', () => {
    expect(formatCountdownClock(countdownParts('2026-09-28T11:02:03Z', NOW))).toBe('01:02:03');
    expect(countdownParts(NOW.getTime() + 400, NOW)).toMatchObject({ expired: false, seconds: 1 });
  });

  it('到点和过期', () => {
    expect(countdownParts(NOW, NOW)).toMatchObject({ expired: true, totalSeconds: 0 });
    const late = countdownParts('2026-09-26T07:00:00Z', NOW);
    expect(late).toMatchObject({ expired: true, days: 2, hours: 3, minutes: 0, seconds: 0 });
    expect(describeCountdown('2026-09-26T07:00:00Z', NOW)).toBe('已超过 2 天 3 小时 0 分 0 秒');
  });

  it('接受 Date、ISO 字符串和毫秒数', () => {
    const at = new Date('2026-09-29T10:00:00Z');
    expect(countdownParts(at, NOW).days).toBe(1);
    expect(countdownParts(at.toISOString(), NOW.getTime()).days).toBe(1);
    expect(countdownParts(at.getTime(), NOW).days).toBe(1);
  });
});
