import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db.ts';
import { runMigrations } from '../migrate.ts';
import { activityLog, projects, tasks } from '../schema.ts';
import { draftDayPlan, draftWeekPlan } from './drafts.ts';
import { createMilestone } from './milestones.ts';
import { createProject } from './projects.ts';
import { createTask, updateTask } from './tasks.ts';
import { createTheme } from './themes.ts';

let db: Db;

beforeEach(() => {
  db = openDb(':memory:');
  runMigrations(db);
});

// 2026-09-28 是周一（2026-W40）。
const TODAY = '2026-09-28';

describe('周计划草稿', () => {
  it('建议重点：本周与下周到期的里程碑、临近截止的课题', () => {
    const theme = createTheme(db, { title: '城市热岛' });
    const paper = createProject(db, {
      title: '论文',
      themeId: theme.id,
      deadline: '2026-12-31',
      priority: 1,
    });
    const grant = createProject(db, { title: '基金', themeId: theme.id, deadline: '2026-10-20' });
    createMilestone(db, paper.id, { title: '初稿', dueDate: '2026-10-02' });
    createMilestone(db, paper.id, { title: '内审', dueDate: '2026-10-08' });
    createMilestone(db, paper.id, { title: '远期', dueDate: '2026-12-01' });

    const draft = draftWeekPlan(db, '2026-W40', TODAY);
    expect(draft.suggestedFocus).toEqual([
      '完成里程碑"初稿"（论文，10月2日到期）',
      '推进里程碑"内审"（论文，下周10月8日到期）',
      '推进课题"基金"（10月20日截止）',
    ]);
    expect(draft.milestones.map((m) => m.title)).toEqual(['初稿', '内审']);
    expect(grant.id).toBeGreaterThan(0);
  });

  it('建议任务：按分数排序并写明理由，已在本周的不再建议', () => {
    const paper = createProject(db, { title: '论文' });
    const m = createMilestone(db, paper.id, { title: '初稿', dueDate: '2026-10-01' });
    const low = createTask(db, { title: '整理参考文献', projectId: paper.id, priority: 3 });
    const urgent = createTask(db, { title: '写结果部分', milestoneId: m.id, priority: 1 });
    const carried = createTask(db, { title: '补图', projectId: paper.id, weekKey: '2026-W39' });
    createTask(db, { title: '已在本周', projectId: paper.id, weekKey: '2026-W40' });

    const draft = draftWeekPlan(db, '2026-W40', TODAY);
    expect(draft.suggestedTasks.map((d) => d.task.id)).toEqual([urgent.id, carried.id, low.id]);
    expect(draft.suggestedTasks[0]?.reasons).toEqual(['高优先级', '里程碑"初稿"10月1日到期']);
    expect(draft.suggestedTasks[1]?.reasons).toEqual(['2026-W39 没做完']);
    expect(draft.alreadyPlanned.map((t) => t.title)).toEqual(['已在本周']);
  });

  it('停滞和暂停的课题影响分数', () => {
    const active = createProject(db, { title: '停滞的课题' });
    const paused = createProject(db, { title: '暂停的课题', status: 'paused' });
    const a = createTask(db, { title: 'a', projectId: active.id });
    const b = createTask(db, { title: 'b', projectId: paused.id });
    const old = new Date('2026-08-01T00:00:00');
    db.update(projects).set({ updatedAt: old }).run();
    db.update(tasks).set({ updatedAt: old }).run();
    db.update(activityLog).set({ at: old }).run();

    const [first, second] = draftWeekPlan(db, '2026-W40', TODAY).suggestedTasks;
    expect(first?.task.id).toBe(a.id);
    expect(first?.reasons).toEqual([expect.stringMatching(/^课题已 \d+ 天没有进展$/)]);
    expect(second?.task.id).toBe(b.id);
    expect(second?.reasons).toEqual(['课题暂停中']);
  });
});

describe('日计划草稿', () => {
  it('从当天安排、待接手和本周任务池里挑最多 3 件，不选受阻的', () => {
    const p = createProject(db, { title: '论文' });
    const scheduled = createTask(db, { title: '已排今天', projectId: p.id, scheduledDate: TODAY });
    const doing = createTask(db, { title: '正在做', projectId: p.id, weekKey: '2026-W40', status: 'doing' });
    const carried = createTask(db, { title: '昨天没做完', projectId: p.id, scheduledDate: '2026-09-27' });
    const blocked = createTask(db, {
      title: '受阻',
      projectId: p.id,
      weekKey: '2026-W40',
      status: 'blocked',
      priority: 1,
    });
    createTask(db, { title: '普通', projectId: p.id, weekKey: '2026-W40', priority: 3 });
    const done = createTask(db, { title: '做完了', projectId: p.id, scheduledDate: TODAY });
    updateTask(db, done.id, { status: 'done' });

    const draft = draftDayPlan(db, TODAY);
    expect(draft.suggestedTop.map((d) => d.task.id)).toEqual([doing.id, scheduled.id, carried.id]);
    expect(draft.suggestedTop[2]?.reasons).toContain('从9月27日延续下来');
    expect(draft.otherCandidates.map((d) => d.task.id)).toContain(blocked.id);
    expect(draft.doneToday.map((t) => t.title)).toEqual(['做完了']);
  });
});
