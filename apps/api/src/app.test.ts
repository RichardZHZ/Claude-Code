import { beforeEach, describe, expect, it } from 'vitest';
import { isoWeekKey, openDb, runMigrations, toDateString } from '@researchpilot/core';
import type {
  DayViewDto,
  FocusSessionDto,
  FocusStateDto,
  WeekRecapDto,
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

describe('议题倒计时', () => {
  it('新建时设定，修改、取消；GET /api/countdowns 按截止时刻排序', async () => {
    const a = await call<{ id: number; countdownAt: string | null }>('POST', '/themes', {
      title: '博士论文',
      countdownAt: '2027-06-30T18:00:00+08:00',
    });
    expect(a.status).toBe(201);
    expect(a.data.countdownAt).toBe('2027-06-30T10:00:00.000Z');
    const b = await call<{ id: number }>('POST', '/themes', { title: '基金申请' });
    await call('PATCH', `/themes/${b.data.id}`, { countdownAt: '2026-12-01T09:30:15Z' });

    const list = await call<{ themeId: number; title: string; at: string }[]>('GET', '/countdowns');
    expect(list.data).toEqual([
      { themeId: b.data.id, title: '基金申请', status: 'active', at: '2026-12-01T09:30:15.000Z' },
      { themeId: a.data.id, title: '博士论文', status: 'active', at: '2027-06-30T10:00:00.000Z' },
    ]);

    await call('PATCH', `/themes/${a.data.id}`, { countdownAt: null });
    expect((await call<unknown[]>('GET', '/countdowns')).data).toHaveLength(1);

    const bad = await call<{ error: string }>('PATCH', `/themes/${a.data.id}`, { countdownAt: '明年' });
    expect(bad.status).toBe(400);
  });
});

describe('健康检查、活动记录、日历', () => {
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

  it('复盘接口已经移除', async () => {
    expect((await call('GET', '/reviews')).status).toBe(404);
    expect((await call('PUT', '/days/2026-09-28/review', { done: '' })).status).toBe(404);
    expect((await call('PUT', '/weeks/2026-W40/review', { wins: [] })).status).toBe(404);
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

describe('文献与链接', () => {
  async function withZotero(mode: 'up' | 'down') {
    const { createZoteroClient } = await import('@researchpilot/core');
    const { fakeZoteroFetch } = await import('@researchpilot/core/testing');
    const db = openDb(':memory:');
    runMigrations(db);
    const zotero = createZoteroClient({
      baseUrl: 'http://127.0.0.1:23119',
      fetch: fakeZoteroFetch(undefined, mode),
    });
    app = createApp({ db, today: () => '2026-09-28', zotero });
  }

  it('添加链接、关联文献、列出、删除', async () => {
    await withZotero('up');
    const project = await call<{ id: number }>('POST', '/projects', { title: '论文' });
    const owner = { ownerType: 'project', ownerId: project.data.id };

    const link = await call<{ id: number }>('POST', '/resources', {
      ...owner,
      kind: 'url',
      ref: 'https://overleaf.com/p',
      label: 'Overleaf',
    });
    expect(link.status).toBe(201);
    expect((await call('POST', '/resources', { ...owner, kind: 'url', ref: 'not a url' })).status).toBe(400);

    const lit = await call<{ label: string }>('POST', '/resources/zotero', { ...owner, itemKey: 'OKE1982A' });
    expect(lit).toMatchObject({
      status: 201,
      data: { label: 'Oke (1982) The energetic basis of the urban heat island' },
    });
    expect((await call('POST', '/resources/zotero', { ...owner, itemKey: 'OKE1982A' })).status).toBe(400);

    const list = await call<{ kind: string }[]>(
      'GET',
      `/resources?ownerType=project&ownerId=${project.data.id}`,
    );
    expect(list.data.map((r) => r.kind)).toEqual(['url', 'zotero']);
    expect((await call('DELETE', `/resources/${link.data.id}`)).status).toBe(204);

    const week = await call<{ literature: { ref: string }[] }>(
      'GET',
      '/weeks/' + isoWeekKey(toDateString(new Date())),
    );
    expect(week.data.literature.map((r) => r.ref)).toEqual(['OKE1982A']);
  });

  it('搜索 Zotero；Zotero 没运行时返回 503 和设置提示', async () => {
    await withZotero('up');
    const found = await call<{ key: string }[]>('GET', '/zotero/search?q=heat');
    expect(found.data.map((i) => i.key).sort()).toEqual(['LIZHAO15', 'OKE1982A']);
    expect(await call('GET', '/zotero/status')).toEqual({
      status: 200,
      data: { available: true, message: 'Zotero 已连接' },
    });

    await withZotero('down');
    const res = await call<{ error: string }>('GET', '/zotero/search?q=heat');
    expect(res.status).toBe(503);
    expect(res.data.error).toMatch(/连不上 Zotero/);
    expect((await call<{ available: boolean }>('GET', '/zotero/status')).data.available).toBe(false);
  });
});

describe('专心致志与回顾', () => {
  it('开始、结束、倒计时到点自动存档；GET /api/recap 汇总每天', async () => {
    const db = openDb(':memory:');
    runMigrations(db);
    let clock = new Date(2026, 8, 28, 9, 0);
    app = createApp({ db, today: () => '2026-09-28', now: () => clock });

    const theme = await call<{ id: number }>('POST', '/themes', { title: '气候金融' });
    expect(
      (await call('POST', '/focus/start', { themeId: theme.data.id, mode: 'timer' })).data,
    ).toMatchObject({
      error: '倒计时需要设定分钟数',
    });

    const started = await call<FocusSessionDto>('POST', '/focus/start', {
      themeId: theme.data.id,
      mode: 'stopwatch',
    });
    expect(started.status).toBe(201);
    expect(started.data).toMatchObject({ themeTitle: '气候金融', endedAt: null });
    const again = await call<{ error: string }>('POST', '/focus/start', {
      themeId: theme.data.id,
      mode: 'stopwatch',
    });
    expect(again.status).toBe(400);

    clock = new Date(2026, 8, 28, 10, 30);
    const stopped = await call<FocusSessionDto>('POST', '/focus/stop', {});
    expect(stopped.data.durationMs).toBe(90 * 60_000);

    await call('POST', '/focus/start', { themeId: theme.data.id, mode: 'timer', plannedMinutes: 25 });
    clock = new Date(2026, 8, 28, 11, 0);
    const state = await call<FocusStateDto>('GET', '/focus');
    expect(state.data.running).toBeNull();
    expect(state.data.todayMs).toBe(115 * 60_000);
    expect(state.data.themes[0]).toMatchObject({ title: '气候金融', todayMs: 115 * 60_000, sessions: 2 });

    const recap = await call<WeekRecapDto>('GET', '/recap/2026-W40');
    expect(recap.data.days[0]).toMatchObject({ date: '2026-09-28', focusMs: 115 * 60_000 });
    expect((await call('GET', '/recap/2026-40')).status).toBe(400);

    const id = state.data.todaySessions[0]!.id;
    expect((await call('DELETE', `/focus/sessions/${id}`)).status).toBe(204);
    expect((await call<FocusStateDto>('GET', '/focus')).data.todayMs).toBe(90 * 60_000);
  });
});
