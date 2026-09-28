import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db.ts';
import { runMigrations } from '../migrate.ts';
import { reviews } from '../schema.ts';
import { saveDayPlan, saveDayReview, saveWeekPlan, saveWeekReview } from './plans.ts';
import { createProject } from './projects.ts';
import { listReviews } from './reviews.ts';
import { createTask, updateTask } from './tasks.ts';

let db: Db;

beforeEach(() => {
  db = openDb(':memory:');
  runMigrations(db);
});

const emptyWeek = { wins: [], blockers: [], carryOver: [], reflection: '' };

describe('复盘快照', () => {
  it('每保存一次追加一条，记录当时的完成情况', () => {
    const project = createProject(db, { title: '论文' });
    const a = createTask(db, { title: '清洗数据', projectId: project.id, weekKey: '2026-W40' });
    createTask(db, { title: '跑回归', projectId: project.id, weekKey: '2026-W40' });
    saveWeekPlan(db, '2026-W40', { focus: ['推进分析'] });

    saveWeekReview(db, '2026-W40', { ...emptyWeek, wins: ['第一版'] });
    updateTask(db, a.id, { status: 'done' });
    saveWeekReview(db, '2026-W40', { ...emptyWeek, wins: ['第二版'] });

    const rows = db.select().from(reviews).all();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      kind: 'week',
      periodKey: '2026-W40',
      content: { wins: ['第一版'] },
      stats: { focus: ['推进分析'], done: 0, total: 2, completed: [], unfinished: ['清洗数据', '跑回归'] },
    });
    expect(rows[1]).toMatchObject({
      content: { wins: ['第二版'] },
      stats: { done: 1, total: 2, completed: ['清洗数据'], unfinished: ['跑回归'] },
    });
  });

  it('日复盘记录最重要的事是否完成', () => {
    const project = createProject(db, { title: '论文' });
    const a = createTask(db, { title: '写提纲', projectId: project.id });
    const b = createTask(db, { title: '读文献', projectId: project.id, scheduledDate: '2026-09-28' });
    saveDayPlan(db, '2026-09-28', { topTaskIds: [a.id] });
    updateTask(db, a.id, { status: 'done' });
    saveDayReview(db, '2026-09-28', { done: '写完提纲', blockers: '', tomorrow: '' });

    const [row] = db.select().from(reviews).all();
    expect(row).toMatchObject({
      kind: 'day',
      periodKey: '2026-09-28',
      stats: { topTasks: [{ title: '写提纲', done: true }], done: 1, total: 2 },
    });
    expect(b.id).toBeGreaterThan(0);
  });
});

describe('复盘时间线', () => {
  it('每个周期只显示最新一版，并给出版本数', () => {
    saveWeekReview(db, '2026-W39', { ...emptyWeek, reflection: 'W39 v1' });
    saveDayReview(db, '2026-09-28', { done: '日 v1', blockers: '', tomorrow: '' });
    saveWeekReview(db, '2026-W39', { ...emptyWeek, reflection: 'W39 v2' });
    saveWeekReview(db, '2026-W40', { ...emptyWeek, reflection: 'W40 v1' });

    const list = listReviews(db);
    expect(list.map((r) => [r.periodKey, r.versions])).toEqual([
      ['2026-W40', 1],
      ['2026-W39', 2],
      ['2026-09-28', 1],
    ]);
    expect(list[1]?.content).toMatchObject({ reflection: 'W39 v2' });
  });

  it('按类型筛选、按 id 翻页', () => {
    saveDayReview(db, '2026-09-26', { done: 'a', blockers: '', tomorrow: '' });
    saveDayReview(db, '2026-09-27', { done: 'b', blockers: '', tomorrow: '' });
    saveWeekReview(db, '2026-W39', emptyWeek);
    saveDayReview(db, '2026-09-28', { done: 'c', blockers: '', tomorrow: '' });

    expect(listReviews(db, { kind: 'week' }).map((r) => r.periodKey)).toEqual(['2026-W39']);
    const page1 = listReviews(db, { kind: 'day', limit: 2 });
    expect(page1.map((r) => r.periodKey)).toEqual(['2026-09-28', '2026-09-27']);
    const page2 = listReviews(db, { kind: 'day', limit: 2, before: page1.at(-1)!.id });
    expect(page2.map((r) => r.periodKey)).toEqual(['2026-09-26']);
  });
});
