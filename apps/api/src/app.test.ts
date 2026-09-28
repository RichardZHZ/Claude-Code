import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, runMigrations } from '@researchpilot/core';
import type {
  DayViewDto,
  ProjectDetailDto,
  TaskViewDto,
  ThemeMapDto,
  WeekViewDto,
} from '@researchpilot/core/contracts';
import { createApp, type App } from './app.ts';

let app: App;

beforeEach(() => {
  const db = openDb(':memory:');
  runMigrations(db);
  app = createApp({ db, today: () => '2026-09-28' });
});

async function call<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const res = await app.request(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, data: (text ? JSON.parse(text) : null) as T };
}

describe('基础', () => {
  it('GET /api/health 返回数据库状态和当前周', async () => {
    expect(await call('GET', '/health')).toEqual({
      status: 200,
      data: { ok: true, today: '2026-09-28', week: '2026-W40' },
    });
  });

  it('未知路由返回 404 JSON', async () => {
    expect(await call('GET', '/nope')).toEqual({ status: 404, data: { error: '未找到该接口' } });
  });
});

describe('错误处理', () => {
  it('参数校验失败返回 400 和中文说明', async () => {
    const res = await call<{ error: string; issues: unknown[] }>('POST', '/themes', { title: '  ' });
    expect(res.status).toBe(400);
    expect(res.data.error).toBe('标题不能为空');
    expect(res.data.issues).toHaveLength(1);
  });

  it('不存在的资源返回 404', async () => {
    expect(await call('GET', '/projects/99')).toEqual({ status: 404, data: { error: '课题不存在：99' } });
    expect((await call('PATCH', '/tasks/99', { title: 'x' })).status).toBe(404);
  });

  it('编号不是数字返回 400', async () => {
    expect((await call('GET', '/projects/abc')).status).toBe(400);
  });

  it('业务规则冲突返回 400', async () => {
    const res = await call<{ error: string }>('POST', '/tasks', { title: '没有归属' });
    expect(res).toEqual({ status: 400, data: { error: '任务需要归属某个课题或议题' } });
  });

  it('请求体不是合法 JSON 返回 400', async () => {
    const res = await app.request('/api/themes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad',
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: '请求内容不是合法的 JSON' });
  });

  it('周编号和日期参数不合法返回 400', async () => {
    expect((await call('GET', '/weeks/2026-40')).status).toBe(400);
    expect((await call('GET', '/days/2026-13-01')).status).toBe(400);
  });
});

describe('完整流程：议题 → 课题 → 任务 → 本周 → 今天 → 完成', () => {
  it('各接口串起来工作', async () => {
    const theme = await call<{ id: number }>('POST', '/themes', {
      title: '议题',
      coreQuestions: ['问题一', ''],
    });
    expect(theme.status).toBe(201);

    const project = await call<{ id: number; status: string }>('POST', '/projects', {
      title: '课题',
      themeId: theme.data.id,
      kind: 'paper',
      deadline: '2026-12-31',
    });
    expect(project.data.status).toBe('active');

    const ms = await call<{ id: number }>('POST', `/projects/${project.data.id}/milestones`, {
      title: '初稿',
      dueDate: '2026-10-02',
    });
    const task = await call<TaskViewDto>('POST', '/tasks', { title: '写方法部分', milestoneId: ms.data.id });
    expect(task.data).toMatchObject({ projectId: project.data.id, projectTitle: '课题', themeTitle: '议题' });
    expect(typeof task.data.createdAt).toBe('string');

    // 排进本周
    await call('PATCH', `/tasks/${task.data.id}`, { weekKey: '2026-W40' });
    await call('PUT', '/weeks/2026-W40/plan', { focus: ['推进初稿'] });
    const week = await call<WeekViewDto>('GET', '/weeks/2026-W40');
    expect(week.data.tasks.map((t) => t.id)).toEqual([task.data.id]);
    expect(week.data.plan.focus).toEqual(['推进初稿']);
    expect(week.data.milestonesDue.map((m) => m.id)).toEqual([ms.data.id]);

    // 设为今天最重要的事
    let day = await call<DayViewDto>('GET', '/days/2026-09-28');
    expect(day.data.weekPool.map((t) => t.id)).toEqual([task.data.id]);
    day = await call<DayViewDto>('PUT', '/days/2026-09-28/plan', { topTaskIds: [task.data.id] });
    expect(day.data.topTasks.map((t) => t.id)).toEqual([task.data.id]);
    expect(day.data.weekPool).toEqual([]);

    // 完成
    const done = await call<TaskViewDto>('PATCH', `/tasks/${task.data.id}`, { status: 'done' });
    expect(done.data.doneAt).not.toBeNull();
    await call('PUT', '/days/2026-09-28/review', { done: '写完了', blockers: '', tomorrow: '' });

    const detail = await call<ProjectDetailDto>('GET', `/projects/${project.data.id}`);
    expect(detail.data.progress).toEqual({ done: 1, total: 1, percent: 100 });

    const map = await call<ThemeMapDto>('GET', '/map');
    expect(map.data.themes[0]?.coreQuestions).toEqual(['问题一']);
    expect(map.data.themes[0]?.projects[0]?.milestones[0]?.progress.percent).toBe(100);

    const open = await call<TaskViewDto[]>('GET', `/tasks?projectId=${project.data.id}&open=true`);
    expect(open.data).toEqual([]);

    expect((await call('DELETE', `/tasks/${task.data.id}`)).status).toBe(204);
  });

  it('收件箱记录升级为任务', async () => {
    const theme = await call<{ id: number }>('POST', '/themes', { title: '议题' });
    const item = await call<{ id: number }>('POST', '/inbox', { content: '读一篇综述' });
    const promoted = await call<{ created: { type: string; id: number } }>(
      'POST',
      `/inbox/${item.data.id}/promote`,
      {
        type: 'task',
        themeId: theme.data.id,
      },
    );
    expect(promoted.status).toBe(201);
    expect(promoted.data.created.type).toBe('task');
    const inbox = await call<{ pending: unknown[]; processed: unknown[] }>('GET', '/inbox');
    expect(inbox.data.pending).toHaveLength(0);
    expect(inbox.data.processed).toHaveLength(1);

    const owners = await call<{ themes: { id: number }[] }>('GET', '/owners');
    expect(owners.data.themes.map((t) => t.id)).toEqual([theme.data.id]);
  });
});

describe('健康检查、活动记录、复盘时间线、日历', () => {
  it('GET /api/checks 默认用注入的"今天"，也可以指定日期', async () => {
    const project = await call<{ id: number }>('POST', '/projects', { title: '论文' });
    await call('POST', `/projects/${project.data.id}/milestones`, { title: '初稿', dueDate: '2026-09-30' });

    const report = await call<{ today: string; issues: { key: string }[]; counts: Record<string, number> }>(
      'GET',
      '/checks',
    );
    expect(report.data.today).toBe('2026-09-28');
    expect(report.data.issues.map((i) => i.key)).toEqual([expect.stringMatching(/^milestone_at_risk:/)]);
    expect(report.data.counts).toEqual({ danger: 0, warning: 1, info: 0 });

    const later = await call<{ issues: { key: string }[] }>('GET', '/checks?today=2026-09-01');
    expect(later.data.issues).toEqual([]);
    expect((await call('GET', '/checks?today=bad')).status).toBe(400);
  });

  it('GET /api/activity 按课题筛选，附中文说明', async () => {
    const project = await call<{ id: number }>('POST', '/projects', { title: '论文' });
    const task = await call<{ id: number }>('POST', '/tasks', {
      title: '跑回归',
      projectId: project.data.id,
    });
    await call('PATCH', `/tasks/${task.data.id}`, { status: 'done' });
    await call('POST', '/projects', { title: '别的课题' });

    const feed = await call<{ summary: string; at: string }[]>(
      'GET',
      `/activity?projectId=${project.data.id}`,
    );
    expect(feed.data.map((a) => a.summary)).toEqual([
      '完成任务"跑回归"',
      '新建任务"跑回归"',
      '新建课题"论文"',
    ]);
    expect(typeof feed.data[0]?.at).toBe('string');
  });

  it('GET /api/reviews 返回复盘时间线', async () => {
    await call('PUT', '/weeks/2026-W40/review', { wins: ['a'], blockers: [], carryOver: [], reflection: '' });
    await call('PUT', '/weeks/2026-W40/review', { wins: ['b'], blockers: [], carryOver: [], reflection: '' });
    const list = await call<{ periodKey: string; versions: number; content: { wins: string[] } }[]>(
      'GET',
      '/reviews?kind=week',
    );
    expect(list.data).toMatchObject([{ periodKey: '2026-W40', versions: 2, content: { wins: ['b'] } }]);
    expect((await call('GET', '/reviews?kind=month')).status).toBe(400);
  });

  it('GET /api/calendar.ics 返回日历文件', async () => {
    await call('POST', '/projects', { title: '论文', deadline: '2026-12-31' });
    const res = await app.request('/api/calendar.ics');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    const text = await res.text();
    expect(text).toContain('SUMMARY:截止：论文');
    expect(text).toContain('DTSTART;VALUE=DATE:20261231');
  });
});
