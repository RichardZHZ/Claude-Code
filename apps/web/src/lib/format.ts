import { daysBetween, toDateString, weekdayOf, weekRange } from '@researchpilot/core/week';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 今天的日期字符串（按本机时区）。 */
export function todayString(): string {
  return toDateString(new Date());
}

export function weekdayLabel(date: string): string {
  return WEEKDAYS[weekdayOf(date)] ?? '';
}

/** '2026-09-28' → '9月28日' */
export function monthDay(date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

/** '2026-09-28' → '9月28日 周一' */
export function longDate(date: string): string {
  return `${monthDay(date)} ${weekdayLabel(date)}`;
}

/** '2026-W40' → '9月28日 – 10月4日' */
export function weekRangeLabel(weekKey: string): string {
  const { start, end } = weekRange(weekKey);
  return `${monthDay(start)} – ${monthDay(end)}`;
}

/** 截止日期相对今天的描述与紧急程度。 */
export function dueInfo(due: string, today: string): { label: string; tone: 'overdue' | 'soon' | 'normal' } {
  const days = daysBetween(today, due);
  if (days < 0) return { label: `逾期 ${-days} 天`, tone: 'overdue' };
  if (days === 0) return { label: '今天到期', tone: 'soon' };
  if (days <= 7) return { label: `还剩 ${days} 天`, tone: 'soon' };
  const sameYear = due.slice(0, 4) === today.slice(0, 4);
  return { label: sameYear ? monthDay(due) : `${due.slice(0, 4)}年${monthDay(due)}`, tone: 'normal' };
}

/** ISO 时间戳 → '14:05'（本机时区）。 */
export function timeOfDay(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** ISO 时间戳 → '9月28日 14:05'（本机时区）。 */
export function dateTimeLabel(iso: string): string {
  return `${monthDay(toDateString(new Date(iso)))} ${timeOfDay(iso)}`;
}

/** 多行文本 ↔ 字符串列表。 */
export const linesToList = (text: string) =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
export const listToLines = (items: readonly string[]) => items.join('\n');
