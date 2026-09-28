// 日期与 ISO 周编号工具。所有计算都在 UTC 上做，避免时区导致跨天。
// 日期字符串统一为 'YYYY-MM-DD'，周编号统一为 'YYYY-Www'（例如 '2026-W40'）。

const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEK_RE = /^(\d{4})-W(\d{2})$/;

/** 把本地时间的 Date 转成 'YYYY-MM-DD'（按用户所在时区的日历日）。 */
export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDate(date: string): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`日期格式应为 YYYY-MM-DD：${date}`);
  const [, y, mo, d] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  if (new Date(ms).toISOString().slice(0, 10) !== date) throw new Error(`无效日期：${date}`);
  return ms;
}

function formatUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** 周一为 0，周日为 6。 */
function isoWeekday(ms: number): number {
  return (new Date(ms).getUTCDay() + 6) % 7;
}

/** 返回某天所在的 ISO 周编号，例如 '2026-09-28' -> '2026-W40'。 */
export function isoWeekKey(date: string): string {
  const ms = parseDate(date);
  // ISO 周归属于"本周四"所在的年份。
  const thursday = ms + (3 - isoWeekday(ms)) * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const dayOfYear = Math.floor((thursday - Date.UTC(year, 0, 1)) / DAY_MS);
  const week = Math.floor(dayOfYear / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** 返回某个 ISO 周的周一和周日日期。 */
export function weekRange(weekKey: string): { start: string; end: string } {
  const m = WEEK_RE.exec(weekKey);
  if (!m) throw new Error(`周编号格式应为 YYYY-Www：${weekKey}`);
  const year = Number(m[1]);
  const week = Number(m[2]);
  const jan4 = Date.UTC(year, 0, 4);
  const week1Monday = jan4 - isoWeekday(jan4) * DAY_MS;
  const start = week1Monday + (week - 1) * 7 * DAY_MS;
  if (week < 1 || isoWeekKey(formatUtc(start)) !== weekKey) throw new Error(`无效周编号：${weekKey}`);
  return { start: formatUtc(start), end: formatUtc(start + 6 * DAY_MS) };
}

/** 是否为合法的 'YYYY-MM-DD' 日期。 */
export function isValidDate(date: string): boolean {
  try {
    parseDate(date);
    return true;
  } catch {
    return false;
  }
}

/** 是否为合法的 ISO 周编号 'YYYY-Www'。 */
export function isValidWeekKey(weekKey: string): boolean {
  try {
    weekRange(weekKey);
    return true;
  } catch {
    return false;
  }
}

/** 日期加减天数。 */
export function addDays(date: string, days: number): string {
  return formatUtc(parseDate(date) + days * DAY_MS);
}

/** 星期几：周一为 0，周日为 6。 */
export function weekdayOf(date: string): number {
  return isoWeekday(parseDate(date));
}

/** 从 from 到 to 相差多少天（to 在后为正）。 */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseDate(to) - parseDate(from)) / DAY_MS);
}

/** 相邻周：offset 为 -1 表示上周，1 表示下周。 */
export function shiftWeek(weekKey: string, offset: number): string {
  return isoWeekKey(addDays(weekRange(weekKey).start, offset * 7));
}
