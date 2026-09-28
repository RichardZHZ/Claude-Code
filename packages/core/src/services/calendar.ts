import { and, asc, eq, isNotNull, isNull, notInArray } from 'drizzle-orm';
import type { Conn } from '../db.ts';
import { CLOSED_PROJECT_STATUSES } from '../enums.ts';
import { milestones, projects, themes } from '../schema.ts';
import { addDays } from '../week.ts';

/** 一个全天事件。 */
export type CalendarEvent = {
  /** 稳定的唯一标识：同一个里程碑重复导出时，日历应用会更新而不是新增。 */
  uid: string;
  date: string;
  summary: string;
  description?: string;
};

/** 需要进日历的日期：未完成的里程碑，以及未结束课题的截止日期。 */
export function getCalendarEvents(db: Conn): CalendarEvent[] {
  const ms = db
    .select({ m: milestones, projectTitle: projects.title, themeTitle: themes.title })
    .from(milestones)
    .innerJoin(projects, eq(milestones.projectId, projects.id))
    .leftJoin(themes, eq(projects.themeId, themes.id))
    .where(
      and(
        isNotNull(milestones.dueDate),
        isNull(milestones.doneAt),
        notInArray(projects.status, [...CLOSED_PROJECT_STATUSES]),
      ),
    )
    .orderBy(asc(milestones.dueDate), asc(milestones.id))
    .all();

  const deadlines = db
    .select({ p: projects, themeTitle: themes.title })
    .from(projects)
    .leftJoin(themes, eq(projects.themeId, themes.id))
    .where(and(isNotNull(projects.deadline), notInArray(projects.status, [...CLOSED_PROJECT_STATUSES])))
    .orderBy(asc(projects.deadline), asc(projects.id))
    .all();

  const context = (project: string, theme: string | null) =>
    theme ? `课题：${project}\n议题：${theme}` : `课题：${project}`;

  return [
    ...ms.map(({ m, projectTitle, themeTitle }) => ({
      uid: `milestone-${m.id}@researchpilot`,
      date: m.dueDate!,
      summary: `◆ ${m.title}（${projectTitle}）`,
      description: context(projectTitle, themeTitle),
    })),
    ...deadlines.map(({ p, themeTitle }) => ({
      uid: `project-${p.id}-deadline@researchpilot`,
      date: p.deadline!,
      summary: `截止：${p.title}`,
      description: context(p.title, themeTitle),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- ICS 生成（RFC 5545） ----------

/** 文本转义：反斜杠、分号、逗号、换行。 */
export function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

const encoder = new TextEncoder();

/** 超过 75 字节的行要折行（下一行以空格开头），且不能把一个多字节字符拆开。 */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    // 续行开头的空格占 1 字节。
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compactDate = (date: string) => date.replaceAll('-', '');

function utcStamp(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

export function buildIcs(events: CalendarEvent[], now: Date, calendarName = '科研小助理'): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ResearchPilot//ResearchPilot//ZH',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${utcStamp(now)}`,
      `DTSTART;VALUE=DATE:${compactDate(e.date)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(e.date, 1))}`,
      `SUMMARY:${escapeIcsText(e.summary)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeIcsText(e.description)}`);
    lines.push('TRANSP:TRANSPARENT', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

/** 导出全部里程碑与截止日期为 ICS 文本。 */
export function exportCalendar(db: Conn, now: Date = new Date()): string {
  return buildIcs(getCalendarEvents(db), now);
}
