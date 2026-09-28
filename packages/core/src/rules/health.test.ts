import { describe, expect, it } from 'vitest';
import { evaluateHealth, type HealthSnapshot } from './health.ts';

const base: HealthSnapshot = {
  today: '2026-09-28',
  themes: [{ id: 1, title: '议题', status: 'active', createdOn: '2026-01-01' }],
  projects: [{ id: 10, title: '论文', status: 'active', themeId: 1, lastActiveOn: '2026-09-27' }],
  milestones: [],
  openTasks: [],
};

function run(patch: Partial<HealthSnapshot>) {
  return evaluateHealth({ ...base, ...patch });
}

const keys = (patch: Partial<HealthSnapshot>) => run(patch).map((i) => i.key);

describe('健康检查', () => {
  it('一切正常时没有提醒', () => {
    expect(run({})).toEqual([]);
  });

  describe('课题停滞', () => {
    it('超过 14 天没有活动才提醒', () => {
      const at = (lastActiveOn: string) => keys({ projects: [{ ...base.projects[0]!, lastActiveOn }] });
      expect(at('2026-09-14')).toEqual([]); // 正好 14 天
      expect(at('2026-09-13')).toEqual(['stale_project:10']);
    });

    it('暂停、构想中的课题不提醒', () => {
      const project = { ...base.projects[0]!, lastActiveOn: '2026-01-01' };
      expect(keys({ projects: [{ ...project, status: 'paused' }] })).not.toContain('stale_project:10');
      expect(keys({ projects: [{ ...project, status: 'idea' }] })).not.toContain('stale_project:10');
    });

    it('说明里写出停了多少天和最后更新日期', () => {
      const [issue] = run({ projects: [{ ...base.projects[0]!, lastActiveOn: '2026-09-01' }] });
      expect(issue).toMatchObject({
        severity: 'warning',
        title: '课题"论文"已经 27 天没有进展',
        target: { type: 'project', id: 10 },
      });
      expect(issue?.detail).toContain('9月1日');
    });
  });

  describe('里程碑有风险', () => {
    const m = {
      id: 5,
      title: '初稿',
      projectId: 10,
      dueDate: '2026-10-01',
      done: false,
      taskDone: 1,
      taskTotal: 4,
    };

    it('7 天内到期且完成不到一半', () => {
      const [issue] = run({ milestones: [m] });
      expect(issue).toMatchObject({
        key: 'milestone_at_risk:5',
        severity: 'warning',
        title: '里程碑"初稿"还剩 3 天',
      });
      expect(issue?.detail).toContain('1/4（25%）');
    });

    it('完成一半及以上、或还远，不提醒', () => {
      expect(keys({ milestones: [{ ...m, taskDone: 2 }] })).toEqual([]);
      expect(keys({ milestones: [{ ...m, dueDate: '2026-10-06' }] })).toEqual([]);
      expect(keys({ milestones: [{ ...m, dueDate: '2026-10-05' }] })).toEqual(['milestone_at_risk:5']);
    });

    it('没有关联任务视为 0%', () => {
      const [issue] = run({ milestones: [{ ...m, taskDone: 0, taskTotal: 0 }] });
      expect(issue?.detail).toContain('还没有关联任务');
    });

    it('已逾期的一律提醒，级别为危险', () => {
      const [issue] = run({ milestones: [{ ...m, dueDate: '2026-09-26', taskDone: 4 }] });
      expect(issue).toMatchObject({ severity: 'danger', title: '里程碑"初稿"已逾期 2 天' });
    });

    it('今天到期', () => {
      expect(run({ milestones: [{ ...m, dueDate: '2026-09-28' }] })[0]?.title).toBe('里程碑"初稿"今天到期');
    });

    it('已完成、没有日期、或课题不在进行中的不提醒', () => {
      expect(keys({ milestones: [{ ...m, done: true }] })).toEqual([]);
      expect(keys({ milestones: [{ ...m, dueDate: null }] })).toEqual([]);
      expect(keys({ projects: [{ ...base.projects[0]!, status: 'paused' }], milestones: [m] })).not.toContain(
        'milestone_at_risk:5',
      );
    });
  });

  describe('遗留任务', () => {
    it('已完成或放弃的课题下还有未完成任务，按课题汇总', () => {
      const [issue] = run({
        projects: [{ ...base.projects[0]!, status: 'dropped' }],
        openTasks: [
          { projectId: 10, themeId: null, status: 'todo' },
          { projectId: 10, themeId: null, status: 'blocked' },
        ],
      });
      expect(issue).toMatchObject({
        key: 'orphaned_tasks:project:10',
        title: '课题"论文"已放弃，还有 2 项任务没做完',
      });
    });

    it('已结束的议题下还有未完成任务', () => {
      const issues = run({
        themes: [{ ...base.themes[0]!, status: 'closed' }],
        openTasks: [{ projectId: null, themeId: 1, status: 'todo' }],
      });
      expect(issues.map((i) => i.key)).toEqual(['orphaned_tasks:theme:1']);
    });

    it('进行中的课题不算遗留', () => {
      expect(keys({ openTasks: [{ projectId: 10, themeId: null, status: 'todo' }] })).toEqual([]);
    });
  });

  describe('议题缺少课题', () => {
    it('进行中的议题下没有进行中的课题', () => {
      expect(keys({ projects: [{ ...base.projects[0]!, status: 'paused' }] })).toEqual(['dormant_theme:1']);
    });

    it('新建 7 天内的议题、休眠的议题不提醒', () => {
      expect(keys({ projects: [], themes: [{ ...base.themes[0]!, createdOn: '2026-09-22' }] })).toEqual([]);
      expect(keys({ projects: [], themes: [{ ...base.themes[0]!, createdOn: '2026-09-21' }] })).toEqual([
        'dormant_theme:1',
      ]);
      expect(keys({ projects: [], themes: [{ ...base.themes[0]!, status: 'dormant' }] })).toEqual([]);
    });
  });

  it('按严重程度排序：危险、警告、提示', () => {
    const issues = run({
      projects: [
        { ...base.projects[0]!, lastActiveOn: '2026-01-01' },
        { id: 11, title: '旧课题', status: 'done', themeId: 1, lastActiveOn: '2026-01-01' },
      ],
      milestones: [
        { id: 5, title: 'm', projectId: 10, dueDate: '2026-09-20', done: false, taskDone: 0, taskTotal: 0 },
      ],
      openTasks: [{ projectId: 11, themeId: null, status: 'todo' }],
    });
    expect(issues.map((i) => i.severity)).toEqual(['danger', 'warning', 'info']);
  });
});
