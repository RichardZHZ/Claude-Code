import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db.ts';
import { DomainError } from '../errors.ts';
import { runMigrations } from '../migrate.ts';
import { createInboxItem, listInbox, promoteInboxItem } from './inbox.ts';
import { getThemeMap } from './map.ts';
import { createMilestone, updateMilestone } from './milestones.ts';
import { listOwners } from './owners.ts';
import { getDayView, getWeekView, saveDayPlan, saveWeekPlan } from './plans.ts';
import { createProject, deleteProject, getProjectDetail, updateProject } from './projects.ts';
import { createTask, deleteTask, getTaskView, listTasks, updateTask } from './tasks.ts';
import { listActivity } from './activity.ts';
import { createTheme, deleteTheme, listCountdowns, updateTheme } from './themes.ts';

let db: Db;

beforeEach(() => {
  db = openDb(':memory:');
  runMigrations(db);
});

function expectDomainError(fn: () => unknown, code: 'not_found' | 'invalid', message?: RegExp) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe(code);
    if (message) expect((err as DomainError).message).toMatch(message);
    return;
  }
  throw new Error('应当抛出 DomainError');
}

function setup() {
  const theme = createTheme(db, { title: '议题 A' });
  const project = createProject(db, { title: '课题 A1', themeId: theme.id });
  const milestone = createMilestone(db, project.id, { title: '里程碑 1', dueDate: '2026-10-01' });
  return { theme, project, milestone };
}

describe('任务归属', () => {
  it('必须归属课题或议题之一', () => {
    const { theme, project } = setup();
    expectDomainError(() => createTask(db, { title: 't' }), 'invalid', /需要归属/);
    expectDomainError(
      () => createTask(db, { title: 't', projectId: project.id, themeId: theme.id }),
      'invalid',
      /只能归属一个/,
    );
    expectDomainError(() => createTask(db, { title: 't', projectId: 999 }), 'not_found');
  });

  it('只给里程碑时自动归到它的课题', () => {
    const { project, milestone } = setup();
    const t = createTask(db, { title: 't', milestoneId: milestone.id });
    expect(t.projectId).toBe(project.id);
    expect(t.milestoneTitle).toBe('里程碑 1');
  });

  it('里程碑必须属于同一课题', () => {
    const { theme, milestone } = setup();
    const other = createProject(db, { title: '课题 A2', themeId: theme.id });
    expectDomainError(
      () => createTask(db, { title: 't', projectId: other.id, milestoneId: milestone.id }),
      'invalid',
      /不属于该课题/,
    );
  });

  it('任务视图带上课题和议题名称', () => {
    const { theme, project } = setup();
    const inProject = createTask(db, { title: '课题任务', projectId: project.id });
    const inTheme = createTask(db, { title: '议题任务', themeId: theme.id });
    expect(inProject).toMatchObject({
      projectTitle: '课题 A1',
      ownerThemeId: theme.id,
      themeTitle: '议题 A',
    });
    expect(inTheme).toMatchObject({ projectTitle: null, ownerThemeId: theme.id, themeTitle: '议题 A' });
    expect(listTasks(db, { themeId: theme.id })).toHaveLength(2);
  });

  it('把任务从课题移到议题会清空课题和里程碑', () => {
    const { theme, milestone } = setup();
    const t = createTask(db, { title: 't', milestoneId: milestone.id });
    const moved = updateTask(db, t.id, { themeId: theme.id });
    expect(moved).toMatchObject({ projectId: null, milestoneId: null, themeId: theme.id });
  });

  it('换课题时清空原来的里程碑', () => {
    const { theme, milestone } = setup();
    const other = createProject(db, { title: '课题 A2', themeId: theme.id });
    const t = createTask(db, { title: 't', milestoneId: milestone.id });
    expect(updateTask(db, t.id, { projectId: other.id })).toMatchObject({
      projectId: other.id,
      milestoneId: null,
    });
  });
});

describe('任务状态与排期', () => {
  it('完成时记录完成时间，重新打开时清除', () => {
    const { project } = setup();
    const t = createTask(db, { title: 't', projectId: project.id });
    const done = updateTask(db, t.id, { status: 'done' });
    expect(done.doneAt).toBeInstanceOf(Date);
    expect(updateTask(db, t.id, { status: 'doing' }).doneAt).toBeNull();
  });

  it('排到某天会同时排进那一周', () => {
    const { project } = setup();
    const t = createTask(db, { title: 't', projectId: project.id, scheduledDate: '2026-09-30' });
    expect(t.weekKey).toBe('2026-W40');
    const moved = updateTask(db, t.id, { scheduledDate: '2026-10-06' });
    expect(moved).toMatchObject({ scheduledDate: '2026-10-06', weekKey: '2026-W41' });
  });

  it('换到别的周会取消原来的具体日期；同一周内不影响', () => {
    const { project } = setup();
    const t = createTask(db, { title: 't', projectId: project.id, scheduledDate: '2026-09-30' });
    expect(updateTask(db, t.id, { weekKey: '2026-W40' }).scheduledDate).toBe('2026-09-30');
    expect(updateTask(db, t.id, { weekKey: '2026-W41' })).toMatchObject({
      weekKey: '2026-W41',
      scheduledDate: null,
    });
    expect(updateTask(db, t.id, { weekKey: null })).toMatchObject({ weekKey: null, scheduledDate: null });
  });

  it('取消具体日期时仍留在原来那一周', () => {
    const { project } = setup();
    const t = createTask(db, { title: 't', projectId: project.id, scheduledDate: '2026-09-30' });
    expect(updateTask(db, t.id, { scheduledDate: null })).toMatchObject({
      scheduledDate: null,
      weekKey: '2026-W40',
    });
  });

  it('删除不存在的任务报 not_found', () => {
    expectDomainError(() => deleteTask(db, 42), 'not_found');
  });
});

describe('议题与课题', () => {
  it('课题详情包含进度与里程碑进度', () => {
    const { project, milestone } = setup();
    createTask(db, { title: 'a', milestoneId: milestone.id, status: 'done' });
    createTask(db, { title: 'b', milestoneId: milestone.id });
    createTask(db, { title: 'c', projectId: project.id });
    createTask(db, { title: 'd', projectId: project.id, status: 'done' });
    const detail = getProjectDetail(db, project.id);
    expect(detail.theme?.title).toBe('议题 A');
    expect(detail.progress).toEqual({ done: 2, total: 4, percent: 50 });
    expect(detail.milestones[0]?.progress).toEqual({ done: 1, total: 2, percent: 50 });
    expect(detail.tasks).toHaveLength(4);
    expect(detail.tasks.at(-1)?.status).toBe('done');
  });

  it('里程碑可以标记完成与取消', () => {
    const { milestone } = setup();
    expect(updateMilestone(db, milestone.id, { done: true }).doneAt).toBeInstanceOf(Date);
    expect(updateMilestone(db, milestone.id, { done: false }).doneAt).toBeNull();
  });

  it('议题地图汇总各层进度，未归属议题的课题单独列出', () => {
    const { theme, project } = setup();
    createTask(db, { title: 'a', projectId: project.id, status: 'done' });
    createTask(db, { title: 'b', themeId: theme.id });
    const loose = createProject(db, { title: '独立课题' });
    createTheme(db, { title: '休眠议题', status: 'dormant' });

    const map = getThemeMap(db);
    expect(map.themes.map((t) => t.title)).toEqual(['议题 A', '休眠议题']);
    const a = map.themes[0]!;
    expect(a.progress).toEqual({ done: 1, total: 2, percent: 50 });
    expect(a.projects[0]).toMatchObject({ title: '课题 A1', openTaskCount: 0 });
    expect(a.openTasks.map((t) => t.title)).toEqual(['b']);
    expect(map.unassignedProjects.map((p) => p.id)).toEqual([loose.id]);
  });

  it('议题倒计时：可以设定、修改和取消，列表按截止时刻排序、不含已结束的议题', () => {
    const a = createTheme(db, { title: '博士论文', countdownAt: new Date('2027-06-30T10:00:00Z') });
    const b = createTheme(db, { title: '基金申请' });
    const c = createTheme(db, {
      title: '已结束',
      status: 'closed',
      countdownAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(a.countdownAt).toEqual(new Date('2027-06-30T10:00:00Z'));
    expect(b.countdownAt).toBeNull();

    updateTheme(db, b.id, { countdownAt: new Date('2026-12-01T09:30:15Z') });
    expect(listCountdowns(db)).toEqual([
      { themeId: b.id, title: '基金申请', status: 'active', at: new Date('2026-12-01T09:30:15Z') },
      { themeId: a.id, title: '博士论文', status: 'active', at: new Date('2027-06-30T10:00:00Z') },
    ]);

    // 同一时刻再次保存不算修改
    const before = listActivity(db).length;
    updateTheme(db, a.id, { countdownAt: new Date('2027-06-30T10:00:00Z') });
    expect(listActivity(db)).toHaveLength(before);

    updateTheme(db, a.id, { countdownAt: null });
    expect(listCountdowns(db).map((x) => x.themeId)).toEqual([b.id]);
    expect(c.id).toBeGreaterThan(0);
  });

  it('删除议题后课题保留、议题级任务删除', () => {
    const { theme, project } = setup();
    const t = createTask(db, { title: '议题任务', themeId: theme.id });
    deleteTheme(db, theme.id);
    expect(getProjectDetail(db, project.id).themeId).toBeNull();
    expectDomainError(() => getTaskView(db, t.id), 'not_found');
  });

  it('删除课题会删除其任务', () => {
    const { project } = setup();
    const t = createTask(db, { title: 't', projectId: project.id });
    deleteProject(db, project.id);
    expectDomainError(() => getTaskView(db, t.id), 'not_found');
  });

  it('关联不存在的议题报错', () => {
    expectDomainError(() => createProject(db, { title: 'p', themeId: 5 }), 'not_found');
    const { project } = setup();
    expectDomainError(() => updateProject(db, project.id, { themeId: 5 }), 'not_found');
    expectDomainError(() => updateTheme(db, 99, { title: 'x' }), 'not_found');
  });

  it('归属选项不含已结束的议题和课题', () => {
    const { theme, project } = setup();
    createProject(db, { title: '已完成', themeId: theme.id, status: 'done' });
    createTheme(db, { title: '已结束', status: 'closed' });
    const owners = listOwners(db);
    expect(owners.themes.map((t) => t.id)).toEqual([theme.id]);
    expect(owners.projects.map((p) => p.id)).toEqual([project.id]);
  });
});

describe('周计划', () => {
  it('汇总本周任务、待接手、待办池和到期里程碑', () => {
    const { project, milestone } = setup();
    const thisWeek = createTask(db, { title: '本周', projectId: project.id, weekKey: '2026-W40' });
    const lastWeek = createTask(db, { title: '上周没做完', projectId: project.id, weekKey: '2026-W39' });
    createTask(db, { title: '上周做完了', projectId: project.id, weekKey: '2026-W39', status: 'done' });
    const loose = createTask(db, { title: '未排期', projectId: project.id });
    const closed = createProject(db, { title: '已放弃', status: 'dropped' });
    createTask(db, { title: '已放弃课题的任务', projectId: closed.id });
    createMilestone(db, project.id, { title: '远期', dueDate: '2027-01-01' });

    const w = getWeekView(db, '2026-W40');
    expect(w).toMatchObject({
      start: '2026-09-28',
      end: '2026-10-04',
      prevWeek: '2026-W39',
      nextWeek: '2026-W41',
    });
    expect(w.tasks.map((t) => t.id)).toEqual([thisWeek.id]);
    expect(w.carryOver.map((t) => t.id)).toEqual([lastWeek.id]);
    expect(w.backlog.map((t) => t.id)).toEqual([loose.id]);
    expect(w.milestonesDue.map((m) => m.id)).toEqual([milestone.id]);
    expect(w.milestonesDue[0]?.projectTitle).toBe('课题 A1');
    expect(w.plan).toEqual({ focus: [] });
  });

  it('保存重点，去掉空行，重复保存覆盖', () => {
    saveWeekPlan(db, '2026-W40', { focus: ['  推进分析 ', '', '读综述'] });
    const w = saveWeekPlan(db, '2026-W40', { focus: ['推进分析', '读综述', '写提纲'] });
    expect(w.plan.focus).toEqual(['推进分析', '读综述', '写提纲']);
  });
});

describe('日计划', () => {
  it('最重要的事会被排到当天，并保持设定顺序', () => {
    const { project } = setup();
    const a = createTask(db, { title: 'a', projectId: project.id, weekKey: '2026-W40' });
    const b = createTask(db, { title: 'b', projectId: project.id });
    const c = createTask(db, { title: 'c', projectId: project.id, scheduledDate: '2026-09-28' });

    const d = saveDayPlan(db, '2026-09-28', { topTaskIds: [b.id, a.id] });
    expect(d.topTasks.map((t) => t.id)).toEqual([b.id, a.id]);
    expect(d.scheduled.map((t) => t.id)).toEqual([c.id]);
    expect(getTaskView(db, b.id)).toMatchObject({ scheduledDate: '2026-09-28', weekKey: '2026-W40' });
  });

  it('任务移出当天后自动从最重要的事里消失', () => {
    const { project } = setup();
    const a = createTask(db, { title: 'a', projectId: project.id });
    saveDayPlan(db, '2026-09-28', { topTaskIds: [a.id] });
    updateTask(db, a.id, { scheduledDate: '2026-09-29' });
    expect(getDayView(db, '2026-09-28').topTasks).toEqual([]);
  });

  it('引用不存在的任务报错', () => {
    expectDomainError(() => saveDayPlan(db, '2026-09-28', { topTaskIds: [123] }), 'invalid', /123/);
  });

  it('汇总昨日待接手与本周任务池', () => {
    const { project } = setup();
    const old = createTask(db, { title: '昨天没做完', projectId: project.id, scheduledDate: '2026-09-27' });
    createTask(db, {
      title: '昨天做完了',
      projectId: project.id,
      scheduledDate: '2026-09-27',
      status: 'done',
    });
    const pool = createTask(db, { title: '本周未定日期', projectId: project.id, weekKey: '2026-W40' });
    createTask(db, { title: '本周另一天', projectId: project.id, scheduledDate: '2026-10-01' });

    const d = getDayView(db, '2026-09-28');
    expect(d).toMatchObject({ weekKey: '2026-W40', prevDate: '2026-09-27', nextDate: '2026-09-29' });
    expect(d.carryOver.map((t) => t.id)).toEqual([old.id]);
    expect(d.weekPool.map((t) => t.id)).toEqual([pool.id]);
  });
});

describe('收件箱', () => {
  it('升级为任务：默认取第一行作标题，全文放进备注', () => {
    const { project } = setup();
    const item = createInboxItem(db, { content: '换一种识别策略\n参考某篇文章的做法' });
    const res = promoteInboxItem(db, item.id, { type: 'task', projectId: project.id });
    expect(res.created.type).toBe('task');
    expect(getTaskView(db, res.created.id)).toMatchObject({
      title: '换一种识别策略',
      notes: '换一种识别策略\n参考某篇文章的做法',
      projectId: project.id,
    });
    const inbox = listInbox(db);
    expect(inbox.pending).toHaveLength(0);
    expect(inbox.processed[0]).toMatchObject({ promotedType: 'task', promotedId: res.created.id });
  });

  it('升级为议题或课题；同一条不能处理两次', () => {
    const a = createInboxItem(db, { content: '新方向' });
    const theme = promoteInboxItem(db, a.id, { type: 'theme' });
    const b = createInboxItem(db, { content: '新课题' });
    const project = promoteInboxItem(db, b.id, {
      type: 'project',
      themeId: theme.created.id,
      title: '改个名',
    });
    expect(getProjectDetail(db, project.created.id)).toMatchObject({
      title: '改个名',
      themeId: theme.created.id,
    });
    expectDomainError(() => promoteInboxItem(db, a.id, { type: 'theme' }), 'invalid', /处理过/);
  });

  it('升级失败时整体回滚', () => {
    const item = createInboxItem(db, { content: '没有归属的任务' });
    expectDomainError(() => promoteInboxItem(db, item.id, { type: 'task' }), 'invalid');
    expect(listInbox(db).pending).toHaveLength(1);
  });
});
