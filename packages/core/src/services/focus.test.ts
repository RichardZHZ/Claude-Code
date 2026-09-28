import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db.ts';
import { runMigrations } from '../migrate.ts';
import { focusSessions } from '../schema.ts';
import { toDateString } from '../week.ts';
import { listActivity } from './activity.ts';
import { deleteFocusSession, getFocusState, settleFocus, startFocus, stopFocus } from './focus.ts';
import { saveDayPlan } from './plans.ts';
import { createProject } from './projects.ts';
import { getRecapDay, getWeekRecap } from './recap.ts';
import { createTask, updateTask } from './tasks.ts';
import { createTheme, deleteTheme, updateTheme } from './themes.ts';

let db: Db;

beforeEach(() => {
  db = openDb(':memory:');
  runMigrations(db);
});

/** 本机时区 2026-09-28（周一）的某个时刻。 */
const at = (h: number, m = 0, day = 28) => new Date(2026, 8, day, h, m);
const MIN = 60_000;

describe('专心致志', () => {
  it('正计时：开始、结束后存档；同一时间只能进行一段', () => {
    const theme = createTheme(db, { title: '气候金融' });
    const s = startFocus(db, { themeId: theme.id, mode: 'stopwatch' }, at(9));
    expect(s).toMatchObject({
      themeTitle: '气候金融',
      mode: 'stopwatch',
      endedAt: null,
      plannedMinutes: null,
    });

    expect(() => startFocus(db, { themeId: theme.id, mode: 'stopwatch' }, at(9, 5))).toThrow(
      '"气候金融"的专注还在进行，先结束它再开始新的',
    );

    const stopped = stopFocus(db, {}, at(10, 30));
    expect(stopped.durationMs).toBe(90 * MIN);
    expect(stopped.endedAt).toEqual(at(10, 30));
    expect(() => stopFocus(db, {}, at(10, 31))).toThrow('现在没有进行中的专注');
  });

  it('数据库也不允许两段同时进行', () => {
    const theme = createTheme(db, { title: 't' });
    const row = { themeId: theme.id, mode: 'stopwatch' as const, startedAt: at(9) };
    db.insert(focusSessions).values(row).run();
    expect(() => db.insert(focusSessions).values(row).run()).toThrow(/UNIQUE/);
  });

  it('倒计时：到点自动结束并存档，结束时刻取设定的到点时刻', () => {
    const theme = createTheme(db, { title: '写论文' });
    const s = startFocus(db, { themeId: theme.id, mode: 'timer', plannedMinutes: 25 }, at(9));
    expect(settleFocus(db, at(9, 24))).toBeNull();

    const state = getFocusState(db, '2026-09-28', at(9, 40));
    expect(state.running).toBeNull();
    expect(state.todaySessions[0]).toMatchObject({ id: s.id, durationMs: 25 * MIN, endedAt: at(9, 25) });
    expect(state.todayMs).toBe(25 * MIN);

    // 前端点"结束"时恰好已经自动结束：带上 id 就直接返回，不报错。
    expect(stopFocus(db, { id: s.id }, at(9, 41))).toMatchObject({ id: s.id, durationMs: 25 * MIN });
    expect(listActivity(db, { limit: 2 }).map((a) => a.summary)).toEqual([
      '完成专注"写论文"（倒计时），共 25 分',
      '开始专注"写论文"（倒计时 25 分钟）',
    ]);
  });

  it('倒计时可以提前结束，按实际时长存档', () => {
    const theme = createTheme(db, { title: '写论文' });
    startFocus(db, { themeId: theme.id, mode: 'timer', plannedMinutes: 45 }, at(9));
    expect(stopFocus(db, {}, at(9, 10)).durationMs).toBe(10 * MIN);
    expect(listActivity(db, { limit: 1 })[0]?.summary).toBe('结束专注"写论文"，共 10 分');
  });

  it('按议题统计今天、本周和累计的专注时间', () => {
    const a = createTheme(db, { title: 'A' });
    const b = createTheme(db, { title: 'B' });
    const closed = createTheme(db, { title: '已结束', status: 'closed' });
    // 上周日一段、本周一两段、本周二一段（进行中不计入合计）。
    startFocus(db, { themeId: a.id, mode: 'stopwatch' }, at(20, 0, 27));
    stopFocus(db, {}, at(21, 0, 27));
    startFocus(db, { themeId: a.id, mode: 'stopwatch' }, at(9));
    stopFocus(db, {}, at(9, 30));
    startFocus(db, { themeId: b.id, mode: 'timer', plannedMinutes: 20 }, at(10));
    startFocus(db, { themeId: a.id, mode: 'stopwatch' }, at(9, 0, 29));

    const state = getFocusState(db, '2026-09-29', at(9, 15, 29));
    expect(state.weekKey).toBe('2026-W40');
    expect(state.running).toMatchObject({ themeId: a.id, durationMs: 15 * MIN });
    expect(state.todayMs).toBe(0);
    expect(state.weekMs).toBe(50 * MIN);
    expect(state.themes.map((t) => [t.title, t.todayMs, t.weekMs, t.totalMs, t.sessions])).toEqual([
      ['A', 0, 30 * MIN, 90 * MIN, 2],
      ['B', 0, 20 * MIN, 20 * MIN, 1],
    ]);
    expect(state.themes.some((t) => t.themeId === closed.id)).toBe(false);
  });

  it('已结束的议题不能开始专注；议题删除后记录一并删除', () => {
    const theme = createTheme(db, { title: '旧方向' });
    startFocus(db, { themeId: theme.id, mode: 'stopwatch' }, at(9));
    stopFocus(db, {}, at(10));
    updateTheme(db, theme.id, { status: 'closed' });
    expect(() => startFocus(db, { themeId: theme.id, mode: 'stopwatch' }, at(11))).toThrow('已结束');
    // 结束了但有记录的议题仍出现在统计里。
    expect(getFocusState(db, '2026-09-28', at(11)).themes.map((t) => t.title)).toEqual(['旧方向']);

    deleteTheme(db, theme.id);
    expect(db.select().from(focusSessions).all()).toHaveLength(0);
  });

  it('删除一段记录；删除进行中的一段等于放弃', () => {
    const theme = createTheme(db, { title: 'A' });
    const s = startFocus(db, { themeId: theme.id, mode: 'stopwatch' }, at(9));
    stopFocus(db, {}, at(9, 1));
    deleteFocusSession(db, s.id, at(9, 2));
    const running = startFocus(db, { themeId: theme.id, mode: 'stopwatch' }, at(9, 3));
    deleteFocusSession(db, running.id, at(9, 4));
    expect(getFocusState(db, '2026-09-28', at(9, 5))).toMatchObject({ running: null, todaySessions: [] });
    expect(listActivity(db, { limit: 1 })[0]?.summary).toBe('删除专注记录"A"，共 1 分');
  });
});

describe('回顾', () => {
  it('每天完成的任务、最重要的事、没做完的安排和专注时间', () => {
    const theme = createTheme(db, { title: '议题' });
    const project = createProject(db, { title: '课题', themeId: theme.id });
    const done = createTask(db, { title: '写提纲', projectId: project.id });
    const open = createTask(db, { title: '跑回归', projectId: project.id });
    saveDayPlan(db, '2026-09-28', { topTaskIds: [open.id, done.id] });
    updateTask(db, done.id, { status: 'done' });

    startFocus(db, { themeId: theme.id, mode: 'stopwatch' }, at(9));
    stopFocus(db, {}, at(10, 15));

    // 完成时刻是真实的当前时间，按本机日历日归到"今天"。
    const day = getRecapDay(db, toDateString(new Date()), new Date());
    expect(day.completed.map((t) => t.title)).toEqual(['写提纲']);

    const monday = getRecapDay(db, '2026-09-28', at(12));
    expect(monday.topTasks.map((t) => [t.title, t.status])).toEqual([
      ['跑回归', 'todo'],
      ['写提纲', 'done'],
    ]);
    expect(monday.unfinished.map((t) => t.title)).toEqual(['跑回归']);
    expect(monday.focusMs).toBe(75 * MIN);
    expect(monday.focusByTheme).toEqual([{ themeId: theme.id, title: '议题', ms: 75 * MIN, sessions: 1 }]);

    const week = getWeekRecap(db, '2026-W40', at(12));
    expect(week.days.map((d) => d.date)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(week).toMatchObject({ prevWeek: '2026-W39', nextWeek: '2026-W41', focusMs: 75 * MIN });
  });
});
