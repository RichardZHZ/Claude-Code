import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createProject,
  createTask,
  createTheme,
  createZoteroClient,
  openDb,
  runMigrations,
  seedSampleData,
  type Db,
} from '@researchpilot/core';
import { fakeZoteroFetch } from '@researchpilot/core/testing';
import { createServer } from './server.ts';

const TODAY = '2026-09-28';
let db: Db;
let client: Client;

async function connect(zoteroMode: 'up' | 'down' = 'up') {
  const zotero = createZoteroClient({
    baseUrl: 'http://127.0.0.1:23119',
    fetch: fakeZoteroFetch(undefined, zoteroMode),
  });
  const server = createServer({ db, zotero, today: () => TODAY });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 'test', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
}

async function call(
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ text: string; isError: boolean }> {
  const res = (await client.callTool({ name, arguments: args })) as CallToolResult;
  const first = res.content[0];
  return { text: first?.type === 'text' ? first.text : '', isError: res.isError === true };
}

beforeEach(async () => {
  db = openDb(':memory:');
  runMigrations(db);
  await connect();
});

afterEach(async () => {
  await client.close();
});

describe('工具清单', () => {
  it('所有工具都有中文标题、说明和注解，写入工具不标为只读', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'rp_get_overview',
        'rp_list_themes',
        'rp_draft_week_plan',
        'rp_save_week_plan',
        'rp_zotero_search',
        'rp_link_literature',
      ]),
    );
    expect(names.every((n) => n.startsWith('rp_'))).toBe(true);
    for (const t of tools) {
      expect(t.title, t.name).toBeTruthy();
      expect(t.description, t.name).toBeTruthy();
      expect(t.annotations, t.name).toBeDefined();
      const isWrite = /^rp_(save|create|update|capture|promote|link|add)_/.test(t.name);
      expect(t.annotations?.readOnlyHint, t.name).toBe(!isWrite);
    }
  });

  it('提供三个工作流提示', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual(['plan_day', 'plan_week', 'review_week']);
    const prompt = await client.getPrompt({ name: 'plan_week', arguments: { week_key: '2026-W41' } });
    const msg = prompt.messages[0]?.content;
    expect(msg?.type === 'text' ? msg.text : '').toMatch(
      /rp_draft_week_plan（week_key=2026-W41）[\s\S]*没有我的确认不要写入/,
    );
  });
});

describe('读取', () => {
  it('概览包含今天的安排、本周重点和收件箱', async () => {
    seedSampleData(db, TODAY);
    const { text, isError } = await call('rp_get_overview');
    expect(isError).toBe(false);
    expect(text).toContain('9月28日（周一） · 2026-W40');
    expect(text).toContain('跑描述性统计并画图');
    expect(text).toContain('重点：推进论文的主要分析；读完一篇综述');
    expect(text).toContain('待处理 1 条');
  });

  it('议题地图带编号；json 格式可解析', async () => {
    seedSampleData(db, TODAY);
    const md = await call('rp_list_themes');
    expect(md.text).toMatch(/## 议题 #1 【示例】研究议题/);
    expect(md.text).toMatch(/- 课题 #1 【示例】课题：一篇期刊论文/);
    const json = JSON.parse((await call('rp_list_themes', { response_format: 'json' })).text) as {
      themes: { id: number }[];
    };
    expect(json.themes[0]?.id).toBe(1);
  });

  it('任务分页', async () => {
    const p = createProject(db, { title: '论文' });
    for (let i = 1; i <= 5; i++) createTask(db, { title: `任务${i}`, projectId: p.id });
    const page = JSON.parse(
      (await call('rp_list_tasks', { limit: 2, offset: 2, response_format: 'json' })).text,
    ) as {
      total: number;
      has_more: boolean;
      next_offset: number;
      tasks: { title: string }[];
    };
    expect(page).toMatchObject({ total: 5, has_more: true, next_offset: 4 });
    expect(page.tasks.map((t) => t.title)).toEqual(['任务3', '任务4']);
  });
});

describe('草稿与写入', () => {
  it('周计划草稿附理由；确认后保存重点并排任务', async () => {
    const theme = createTheme(db, { title: '城市热岛' });
    const p = createProject(db, { title: '论文', themeId: theme.id, deadline: '2026-10-10' });
    const t = createTask(db, { title: '写结果部分', projectId: p.id, priority: 1 });

    const draft = await call('rp_draft_week_plan');
    expect(draft.text).toContain('推进课题"论文"（10月10日截止）');
    expect(draft.text).toMatch(new RegExp(`#${t.id} 写结果部分[\\s\\S]*理由：高优先级；课题10月10日截止`));

    expect((await call('rp_save_week_plan', { focus: ['写完结果部分'] })).text).toContain('- 写完结果部分');
    expect((await call('rp_update_task', { task_id: t.id, week_key: '2026-W40' })).text).toContain(
      '2026-W40',
    );
    const week = await call('rp_get_week');
    expect(week.text).toMatch(/本周任务（完成 0\/1）[\s\S]*写结果部分/);
  });

  it('日计划：设定最重要的事、写日志、晚间复盘', async () => {
    const p = createProject(db, { title: '论文' });
    const t = createTask(db, { title: '画图', projectId: p.id, weekKey: '2026-W40' });
    expect((await call('rp_draft_day_plan')).text).toContain(`#${t.id} 画图`);
    const saved = await call('rp_save_day_plan', { top_task_ids: [t.id], journal: '上午画了两张' });
    expect(saved.text).toContain(`#${t.id} 画图`);
    await call('rp_update_task', { task_id: t.id, status: 'done' });
    await call('rp_save_day_review', { done: '图画完了', blockers: '', tomorrow: '写结果' });
    const reviews = await call('rp_list_reviews', { kind: 'day' });
    expect(reviews.text).toMatch(/日复盘 9月28日（周一）[\s\S]*完成 1\/1[\s\S]*完成了：图画完了/);
    const day = await call('rp_get_day');
    expect(day.text).toContain('上午画了两张');
  });

  it('周复盘草稿与保存', async () => {
    const p = createProject(db, { title: '论文' });
    const t = createTask(db, { title: '清洗数据', projectId: p.id, weekKey: '2026-W40' });
    await call('rp_update_task', { task_id: t.id, status: 'done' });
    const draft = await call('rp_draft_week_review');
    expect(draft.text).toContain('完成"清洗数据"（论文）');
    await call('rp_save_week_review', {
      wins: ['数据清洗完成'],
      blockers: [],
      carry_over: [],
      reflection: '顺利',
    });
    expect((await call('rp_list_reviews', { kind: 'week' })).text).toContain('收获：数据清洗完成');
  });

  it('收件箱：记下再转成任务', async () => {
    const theme = createTheme(db, { title: '城市热岛' });
    expect((await call('rp_capture_inbox', { content: '读一篇综述' })).text).toBe('已记入收件箱 #1。');
    const res = await call('rp_promote_inbox', { item_id: 1, type: 'task', theme_id: theme.id });
    expect(res.text).toMatch(/已把收件箱 #1 转成任务 #\d+/);
    expect((await call('rp_list_inbox')).text).toContain('待处理（0）');
  });

  it('更新课题现状并记入动态', async () => {
    const p = createProject(db, { title: '论文' });
    await call('rp_update_project', { project_id: p.id, current_status: '在做稳健性检验' });
    const detail = await call('rp_get_project', { project_id: p.id });
    expect(detail.text).toMatch(/## 现状\n在做稳健性检验/);
    expect(detail.text).toContain('更新课题"论文"的现状');
  });
});

describe('错误提示', () => {
  it('编号不存在时给出下一步建议', async () => {
    const res = await call('rp_get_project', { project_id: 99 });
    expect(res).toEqual({
      isError: true,
      text: '课题不存在：99。请先用 rp_list_themes、rp_list_tasks 等工具确认编号。',
    });
  });

  it('违反业务规则时说明原因', async () => {
    const res = await call('rp_create_task', { title: '没有归属' });
    expect(res.isError).toBe(true);
    expect(res.text).toContain('任务需要归属某个课题或议题');
  });

  it('参数格式不对时报错', async () => {
    const res = await call('rp_get_day', { date: '2026/09/28' });
    expect(res.isError).toBe(true);
    expect(res.text).toContain('日期格式应为 YYYY-MM-DD');
  });
});

describe('Zotero', () => {
  it('搜索并关联文献，出现在课题详情里', async () => {
    const p = createProject(db, { title: '热岛与健康' });
    const found = await call('rp_zotero_search', { query: 'oke' });
    expect(found.text).toContain('OKE1982A · Oke (1982) The energetic basis of the urban heat island');
    const linked = await call('rp_link_literature', {
      owner_type: 'project',
      owner_id: p.id,
      item_key: 'OKE1982A',
    });
    expect(linked.text).toBe(
      '已把文献"Oke (1982) The energetic basis of the urban heat island"关联到 热岛与健康。',
    );
    expect((await call('rp_get_project', { project_id: p.id })).text).toContain('文献 Oke (1982)');
    const again = await call('rp_link_literature', {
      owner_type: 'project',
      owner_id: p.id,
      item_key: 'OKE1982A',
    });
    expect(again).toMatchObject({ isError: true });
  });

  it('添加链接', async () => {
    const p = createProject(db, { title: '论文' });
    const res = await call('rp_add_link', {
      owner_type: 'project',
      owner_id: p.id,
      url: 'https://overleaf.com/x',
      label: 'Overleaf',
    });
    expect(res.text).toMatch(/已添加链接 #\d+ Overleaf 到 论文/);
    expect(
      (await call('rp_add_link', { owner_type: 'project', owner_id: p.id, url: 'ftp://x' })).text,
    ).toContain('链接需要以 http:// 或 https:// 开头');
  });

  it('Zotero 没运行时提示如何开启', async () => {
    await client.close();
    await connect('down');
    const res = await call('rp_zotero_search', { query: 'oke' });
    expect(res.isError).toBe(true);
    expect(res.text).toMatch(
      /连不上 Zotero[\s\S]*允许此计算机上的其他应用程序与 Zotero 通信[\s\S]*请用户检查 Zotero 设置/,
    );
  });
});
