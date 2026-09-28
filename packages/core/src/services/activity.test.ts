import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db.ts';
import { runMigrations } from '../migrate.ts';
import { activityLog } from '../schema.ts';
import { describeActivity, lastActivityByProject, listActivity } from './activity.ts';
import { createInboxItem, promoteInboxItem } from './inbox.ts';
import { createMilestone, updateMilestone } from './milestones.ts';
import { saveDayPlan, saveWeekPlan } from './plans.ts';
import { createProject, deleteProject, updateProject } from './projects.ts';
import { createTask, updateTask } from './tasks.ts';
import { createTheme, updateTheme } from './themes.ts';

let db: Db;

beforeEach(() => {
  db = openDb(':memory:');
  runMigrations(db);
});

function setup() {
  const theme = createTheme(db, { title: '议题' });
  const project = createProject(db, { title: '课题', themeId: theme.id });
  return { theme, project };
}

const summaries = (q: Parameters<typeof listActivity>[1] = {}) => listActivity(db, q).map((a) => a.summary);

describe('活动日志', () => {
  it('新建记录带上课题和议题上下文', () => {
    const { theme, project } = setup();
    createTask(db, { title: '跑回归', projectId: project.id });
    const [latest] = listActivity(db);
    expect(latest).toMatchObject({
      entityType: 'task',
      action: 'created',
      projectId: project.id,
      themeId: theme.id,
      summary: '新建任务"跑回归"',
    });
  });

  it('按变化挑选动作：完成、重开、换状态、排期、移出、换归属、修改', () => {
    const { theme, project } = setup();
    const t = createTask(db, { title: '跑回归', projectId: project.id });
    updateTask(db, t.id, { status: 'doing' });
    updateTask(db, t.id, { status: 'done' });
    updateTask(db, t.id, { status: 'todo' });
    updateTask(db, t.id, { scheduledDate: '2026-09-30' });
    updateTask(db, t.id, { weekKey: null });
    updateTask(db, t.id, { themeId: theme.id });
    updateTask(db, t.id, { title: '跑稳健性回归', notes: '换聚类层级' });

    expect(summaries().reverse().slice(3)).toEqual([
      '任务"跑回归"：待办 → 进行中',
      '完成任务"跑回归"',
      '重新打开任务"跑回归"',
      '任务"跑回归"排到9月30日',
      '任务"跑回归"移出计划',
      '任务"跑回归"更换了归属',
      '修改任务"跑稳健性回归"（标题、备注）',
    ]);
  });

  it('没有实际变化时不记录', () => {
    const { project } = setup();
    const t = createTask(db, { title: 't', projectId: project.id, priority: 2 });
    const before = listActivity(db).length;
    updateTask(db, t.id, { title: 't', priority: 2 });
    updateProject(db, project.id, { title: '课题' });
    expect(listActivity(db)).toHaveLength(before);
  });

  it('课题删除后，记录仍可按课题查询', () => {
    const { project } = setup();
    createTask(db, { title: 't', projectId: project.id });
    deleteProject(db, project.id);
    expect(summaries({ projectId: project.id })).toEqual(['删除课题"课题"', '新建任务"t"', '新建课题"课题"']);
  });

  it('课题现状、状态和里程碑的说明', () => {
    const { project } = setup();
    updateProject(db, project.id, { currentStatus: '在跑稳健性检验' });
    updateProject(db, project.id, { status: 'submitted' });
    const m = createMilestone(db, project.id, { title: '初稿' });
    updateMilestone(db, m.id, { done: true });
    expect(summaries({ projectId: project.id, limit: 4 })).toEqual([
      '完成里程碑"初稿"',
      '新建里程碑"初稿"',
      '课题"课题"：进行中 → 已投稿',
      '更新课题"课题"的现状',
    ]);
  });

  it('选定最重要的事时，被排到当天的任务也记一笔', () => {
    const { project } = setup();
    const t = createTask(db, { title: '写提纲', projectId: project.id });
    saveDayPlan(db, '2026-09-28', { topTaskIds: [t.id], journal: '上午写了一半' });
    expect(summaries({ limit: 3 })).toEqual([
      '更新9月28日的工作日志',
      '选定9月28日最重要的事',
      '任务"写提纲"排到9月28日',
    ]);
  });

  it('周计划、收件箱与议题的说明', () => {
    const { theme } = setup();
    saveWeekPlan(db, '2026-W40', { focus: ['推进分析'] });
    updateTheme(db, theme.id, { status: 'dormant' });
    const item = createInboxItem(db, { content: '换一种识别策略\n细节稍后补' });
    promoteInboxItem(db, item.id, { type: 'theme' });
    expect(summaries({ limit: 5 })).toEqual([
      '收件箱记录"换一种识别策略"转为议题',
      '新建议题"换一种识别策略"',
      '记下："换一种识别策略"',
      '议题"议题"：进行中 → 休眠',
      '写下 2026-W40 的本周重点',
    ]);
  });

  it('按 id 翻页', () => {
    const { project } = setup();
    for (let i = 0; i < 5; i++) createTask(db, { title: `t${i}`, projectId: project.id });
    const first = listActivity(db, { limit: 2 });
    const next = listActivity(db, { limit: 2, before: first.at(-1)!.id });
    expect(first.map((a) => a.summary)).toEqual(['新建任务"t4"', '新建任务"t3"']);
    expect(next.map((a) => a.summary)).toEqual(['新建任务"t2"', '新建任务"t1"']);
  });

  it('每个课题最近一次活动的时间', () => {
    const { project } = setup();
    const other = createProject(db, { title: '另一个' });
    db.insert(activityLog)
      .values({
        entityType: 'task',
        entityId: 99,
        action: 'created',
        projectId: other.id,
        at: new Date('2026-01-01T00:00:00Z'),
      })
      .run();
    const map = lastActivityByProject(db);
    expect(map.get(project.id)).toBeInstanceOf(Date);
    expect(map.get(other.id)!.getTime()).toBeGreaterThan(new Date('2026-01-01T00:00:00Z').getTime());
  });

  it('未知字段名原样显示', () => {
    expect(
      describeActivity({
        entityType: 'task',
        action: 'updated',
        payload: { title: 'x', changes: { foo: [1, 2] } },
      }),
    ).toBe('修改任务"x"（foo）');
  });
});
