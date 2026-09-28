import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db.ts';
import { runMigrations } from '../migrate.ts';
import { buildIcs, escapeIcsText, exportCalendar, foldIcsLine, getCalendarEvents } from './calendar.ts';
import { createMilestone, updateMilestone } from './milestones.ts';
import { createProject } from './projects.ts';
import { createTheme } from './themes.ts';

let db: Db;

beforeEach(() => {
  db = openDb(':memory:');
  runMigrations(db);
});

const NOW = new Date('2026-09-28T08:30:00Z');

describe('ICS 格式', () => {
  it('转义特殊字符', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('长行按字节折行，不拆开汉字', () => {
    const line = `SUMMARY:${'研'.repeat(40)}`; // 8 + 120 字节
    const folded = foldIcsLine(line);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const [i, part] of parts.entries()) {
      expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
      if (i > 0) expect(part.startsWith(' ')).toBe(true);
    }
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join('')).toBe(line);
  });

  it('短行不变', () => {
    expect(foldIcsLine('VERSION:2.0')).toBe('VERSION:2.0');
  });

  it('生成全天事件，使用 CRLF 换行', () => {
    const ics = buildIcs(
      [{ uid: 'x@rp', date: '2026-12-31', summary: '截止：论文', description: '课题：论文' }],
      NOW,
    );
    expect(ics).toContain('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101\r\n');
    expect(ics).toContain('DTSTAMP:20260928T083000Z');
    expect(ics).toContain('SUMMARY:截止：论文');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n');
  });
});

describe('日历事件', () => {
  it('包含未完成的里程碑和未结束课题的截止日期', () => {
    const theme = createTheme(db, { title: '城市热岛' });
    const p = createProject(db, { title: '论文', themeId: theme.id, deadline: '2026-12-31' });
    const m1 = createMilestone(db, p.id, { title: '初稿', dueDate: '2026-10-15' });
    const m2 = createMilestone(db, p.id, { title: '已完成的', dueDate: '2026-10-01' });
    createMilestone(db, p.id, { title: '没有日期' });
    updateMilestone(db, m2.id, { done: true });
    const dropped = createProject(db, { title: '放弃的', deadline: '2026-11-01', status: 'dropped' });

    const events = getCalendarEvents(db);
    expect(events.map((e) => e.uid)).toEqual([
      `milestone-${m1.id}@researchpilot`,
      `project-${p.id}-deadline@researchpilot`,
    ]);
    expect(events[0]).toMatchObject({ summary: '◆ 初稿（论文）', description: '课题：论文\n议题：城市热岛' });
    expect(dropped.id).toBeGreaterThan(0);
  });

  it('导出完整文件', () => {
    const p = createProject(db, { title: '论文', deadline: '2026-12-31' });
    const ics = exportCalendar(db, NOW);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain(`UID:project-${p.id}-deadline@researchpilot`);
    expect(ics).toContain('DESCRIPTION:课题：论文');
  });
});
