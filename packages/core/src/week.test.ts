import { describe, expect, it } from 'vitest';
import { addDays, isoWeekKey, shiftWeek, weekRange } from './week.ts';

describe('isoWeekKey', () => {
  it.each([
    ['2026-09-28', '2026-W40'], // 周一
    ['2026-10-04', '2026-W40'], // 周日
    ['2021-01-03', '2020-W53'], // 年初仍属上一年的最后一周
    ['2024-12-30', '2025-W01'], // 年末已属下一年第一周
    ['2026-01-01', '2026-W01'],
    ['2020-12-31', '2020-W53'],
  ])('%s -> %s', (date, key) => {
    expect(isoWeekKey(date)).toBe(key);
  });

  it('拒绝格式错误或不存在的日期', () => {
    expect(() => isoWeekKey('2026/09/28')).toThrow();
    expect(() => isoWeekKey('2026-02-30')).toThrow();
  });
});

describe('weekRange', () => {
  it('返回周一到周日', () => {
    expect(weekRange('2026-W40')).toEqual({ start: '2026-09-28', end: '2026-10-04' });
    expect(weekRange('2020-W53')).toEqual({ start: '2020-12-28', end: '2021-01-03' });
    expect(weekRange('2025-W01')).toEqual({ start: '2024-12-30', end: '2025-01-05' });
  });

  it('53 周的年份：2026 年从周四开始，有第 53 周', () => {
    expect(weekRange('2026-W53')).toEqual({ start: '2026-12-28', end: '2027-01-03' });
  });

  it('拒绝不存在的周', () => {
    expect(() => weekRange('2025-W53')).toThrow();
    expect(() => weekRange('2026-W00')).toThrow();
  });
});

describe('addDays / shiftWeek', () => {
  it('跨月跨年', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('上周与下周', () => {
    expect(shiftWeek('2026-W01', -1)).toBe('2025-W52');
    expect(shiftWeek('2020-W53', 1)).toBe('2021-W01');
  });
});
