import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  addResource,
  createInboxItem,
  createMilestone,
  createTask,
  DomainError,
  draftDayPlan,
  draftWeekPlan,
  draftWeekReview,
  getDayView,
  getHealthReport,
  getProjectDetail,
  getThemeMap,
  getWeekView,
  isoWeekKey,
  linkZoteroItem,
  listActivity,
  listInbox,
  listResources,
  listReviews,
  listTasks,
  promoteInboxItem,
  saveDayPlan,
  saveDayReview,
  saveWeekPlan,
  saveWeekReview,
  startOfLocalDay,
  addDays,
  toDateString,
  updateProject,
  updateTask,
  type Db,
  type ZoteroClient,
} from '@researchpilot/core';
import {
  addResourceInput,
  createInboxInput,
  createMilestoneInput,
  createTaskInput,
  dayPlanInput,
  dayReviewInput,
  promoteInboxInput,
  updateProjectInput,
  updateTaskInput,
  weekPlanInput,
  weekReviewInput,
  PROJECT_STATUSES,
  REVIEW_KINDS,
  RESOURCE_OWNER_TYPES,
  TASK_STATUSES,
} from '@researchpilot/core/contracts';
import * as F from './format.ts';

export type ServerOptions = {
  db: Db;
  zotero: ZoteroClient;
  /** 注入"今天"便于测试，默认取本机日期。 */
  today?: () => string;
};

export const SERVER_INSTRUCTIONS = `科研小助理（ResearchPilot）：用户本地的科研管理工具。
结构：研究议题（长期方向）→ 课题（论文、基金等有交付物的工作）→ 里程碑 → 任务；任务再被排进周计划和日计划。
所有对象都用 #编号 引用，例如 课题 #3、任务 #12。

使用原则：
1. 先读后写：先用 rp_get_overview、rp_get_week、rp_get_day 或 rp_list_themes 了解现状。
2. 计划与复盘先用 rp_draft_* 取草稿。草稿里的建议和理由由固定规则算出，你负责把它整理成自然、简洁的中文，和用户商量。
3. 任何写入（rp_save_*、rp_create_*、rp_update_*、rp_link_*、rp_add_link、rp_promote_inbox）都要先把将要写入的内容给用户看，得到确认后再调用。
4. 提醒（rp_health_report）是确定性规则的结果，不要自行改写结论，只解释和给建议。
5. 日期用 YYYY-MM-DD，周用 ISO 周编号 YYYY-Www（例如 2026-W40）。不传时默认今天、本周。`;

const responseFormat = z
  .enum(['markdown', 'json'])
  .default('markdown')
  .describe('返回格式：markdown（默认，便于阅读）或 json（完整的结构化数据）');
const dateArg = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式应为 YYYY-MM-DD');
const weekArg = z.string().regex(/^\d{4}-W\d{2}$/, '周编号格式应为 YYYY-Www，例如 2026-W40');
const idArg = z.number().int().positive();

const READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;
const SAVE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const ZOTERO_READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

function text(value: string): CallToolResult {
  return { content: [{ type: 'text', text: value }] };
}

function output(format: 'markdown' | 'json', data: unknown, markdown: () => string): CallToolResult {
  return text(format === 'json' ? JSON.stringify(data, null, 2) : markdown());
}

type ZodLikeError = { name: string; issues: { path: PropertyKey[]; message: string }[] };
const isZodError = (e: unknown): e is ZodLikeError =>
  typeof e === 'object' && e !== null && (e as { name?: string }).name === 'ZodError';

/** 把异常转成 Claude 能看懂、能据此调整的错误结果。 */
export function toErrorResult(err: unknown): CallToolResult {
  let message: string;
  if (err instanceof DomainError) {
    const hint =
      err.code === 'not_found'
        ? '请先用 rp_list_themes、rp_list_tasks 等工具确认编号。'
        : err.code === 'unavailable'
          ? '可以请用户检查 Zotero 设置后再试。'
          : '请修改参数后重试。';
    message = `${err.message}。${hint}`;
  } else if (isZodError(err)) {
    message = `参数不合法：${err.issues.map((i) => `${i.path.map(String).join('.') || '参数'}：${i.message}`).join('；')}`;
  } else {
    console.error(err);
    message = '出现了意外错误，请稍后重试。';
  }
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function safe<A>(fn: (args: A) => CallToolResult | Promise<CallToolResult>) {
  return async (args: A): Promise<CallToolResult> => {
    try {
      return await fn(args);
    } catch (err) {
      return toErrorResult(err);
    }
  };
}

/** 去掉值为 undefined 的键，避免"没传"被当成"清空"。 */
function defined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function createServer({
  db,
  zotero,
  today = () => toDateString(new Date()),
}: ServerOptions): McpServer {
  const server = new McpServer(
    { name: 'researchpilot-mcp-server', version: '0.1.0' },
    { instructions: SERVER_INSTRUCTIONS },
  );
  const thisWeek = () => isoWeekKey(today());

  // ======================= 读取 =======================

  server.registerTool(
    'rp_get_overview',
    {
      title: '今天的概览',
      description:
        '一次看清现在的状态：今天最重要的事与安排、待接手的任务、本周重点与完成度、需要注意的提醒、收件箱待处理数量。开始任何对话时先调用它。',
      inputSchema: { date: dateArg.optional().describe('要看的日期，默认今天') },
      annotations: READ,
    },
    safe(({ date }) => {
      const d = date ?? today();
      const day = getDayView(db, d);
      const week = getWeekView(db, day.weekKey);
      const health = getHealthReport(db, today());
      const inbox = listInbox(db);
      const done = week.tasks.filter((t) => t.status === 'done').length;
      return text(
        [
          F.formatDay(day),
          `\n# 本周（${week.weekKey}）\n重点：${week.plan.focus.join('；') || '（还没写）'}\n任务完成 ${done}/${week.tasks.length}`,
          `\n# 提醒\n${F.formatIssues(health.issues.filter((i) => i.severity !== 'info'))}`,
          `\n# 收件箱\n待处理 ${inbox.pending.length} 条`,
        ].join('\n'),
      );
    }),
  );

  server.registerTool(
    'rp_list_themes',
    {
      title: '议题地图',
      description: '列出全部研究议题及其下的课题、里程碑和进度。用于了解长期目标全貌、查找课题编号。',
      inputSchema: { response_format: responseFormat },
      annotations: READ,
    },
    safe(({ response_format }) => {
      const map = getThemeMap(db);
      return output(response_format, map, () => F.formatThemeMap(map));
    }),
  );

  server.registerTool(
    'rp_get_project',
    {
      title: '课题详情',
      description: '查看一个课题的现状、里程碑、全部任务、关联的文献和链接、最近动态。',
      inputSchema: { project_id: idArg.describe('课题编号'), response_format: responseFormat },
      annotations: READ,
    },
    safe(({ project_id, response_format }) => {
      const project = getProjectDetail(db, project_id);
      const resources = listResources(db, { ownerType: 'project', ownerId: project_id });
      const activity = listActivity(db, { projectId: project_id, limit: 10 });
      return output(response_format, { project, resources, activity }, () =>
        F.formatProject(project, resources, activity),
      );
    }),
  );

  server.registerTool(
    'rp_list_tasks',
    {
      title: '查询任务',
      description: '按课题、议题、周、日期、状态筛选任务，支持分页。',
      inputSchema: {
        project_id: idArg.optional().describe('只看某个课题的任务'),
        theme_id: idArg.optional().describe('只看某个议题（含其下课题）的任务'),
        week_key: weekArg.optional().describe('只看排在某周的任务'),
        scheduled_date: dateArg.optional().describe('只看排在某天的任务'),
        status: z
          .enum(TASK_STATUSES)
          .optional()
          .describe('todo 待办 / doing 进行中 / blocked 受阻 / done 已完成'),
        open: z.boolean().optional().describe('true 只看未完成，false 只看已完成'),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
        response_format: responseFormat,
      },
      annotations: READ,
    },
    safe((a) => {
      const all = listTasks(
        db,
        defined({
          projectId: a.project_id,
          themeId: a.theme_id,
          weekKey: a.week_key,
          scheduledDate: a.scheduled_date,
          status: a.status,
          open: a.open,
        }),
      );
      const page = all.slice(a.offset, a.offset + a.limit);
      const meta = {
        total: all.length,
        count: page.length,
        offset: a.offset,
        has_more: a.offset + page.length < all.length,
        next_offset: a.offset + page.length < all.length ? a.offset + page.length : null,
      };
      return output(a.response_format, { ...meta, tasks: page }, () =>
        [
          `共 ${all.length} 项，显示第 ${a.offset + 1}–${a.offset + page.length} 项${meta.has_more ? `（还有更多，offset=${meta.next_offset}）` : ''}`,
          F.taskLines(page),
        ].join('\n'),
      );
    }),
  );

  server.registerTool(
    'rp_get_week',
    {
      title: '周视图',
      description: '查看某一周的重点、任务、到期里程碑、之前没做完的任务、待办池、关联的文献和周复盘。',
      inputSchema: { week_key: weekArg.optional().describe('默认本周'), response_format: responseFormat },
      annotations: READ,
    },
    safe(({ week_key, response_format }) => {
      const week = getWeekView(db, week_key ?? thisWeek());
      return output(response_format, week, () => F.formatWeek(week));
    }),
  );

  server.registerTool(
    'rp_get_day',
    {
      title: '日视图',
      description: '查看某一天最重要的事、当天安排、待接手任务、本周任务池、工作日志和晚间复盘。',
      inputSchema: { date: dateArg.optional().describe('默认今天'), response_format: responseFormat },
      annotations: READ,
    },
    safe(({ date, response_format }) => {
      const day = getDayView(db, date ?? today());
      return output(response_format, day, () => F.formatDay(day));
    }),
  );

  server.registerTool(
    'rp_health_report',
    {
      title: '健康检查',
      description:
        '按固定规则检查：有风险或逾期的里程碑、停滞的课题、漏写的周复盘、已结束课题下的遗留任务、没有进行中课题的议题。结论由规则决定，请据实转述。',
      inputSchema: { response_format: responseFormat },
      annotations: READ,
    },
    safe(({ response_format }) => {
      const report = getHealthReport(db, today());
      return output(response_format, report, () => F.formatIssues(report.issues));
    }),
  );

  server.registerTool(
    'rp_list_reviews',
    {
      title: '复盘历史',
      description:
        '按时间倒序列出周复盘和日复盘（每个周期取最新一版）。用 before 传上一页最后一条的编号来翻页。',
      inputSchema: {
        kind: z.enum(REVIEW_KINDS).optional().describe('week 周复盘 / day 日复盘，默认两者都要'),
        limit: z.number().int().min(1).max(50).default(10),
        before: idArg.optional().describe('翻页：只取编号小于它的记录'),
        response_format: responseFormat,
      },
      annotations: READ,
    },
    safe(({ kind, limit, before, response_format }) => {
      const list = listReviews(db, defined({ kind, limit, before }));
      return output(response_format, list, () => F.formatReviews(list));
    }),
  );

  server.registerTool(
    'rp_list_activity',
    {
      title: '活动记录',
      description: '按时间倒序列出发生过的变化（新建、完成、排期、关联文献等），可按课题或议题筛选。',
      inputSchema: {
        project_id: idArg.optional(),
        theme_id: idArg.optional(),
        limit: z.number().int().min(1).max(100).default(20),
        before: idArg.optional().describe('翻页：只取编号小于它的记录'),
        response_format: responseFormat,
      },
      annotations: READ,
    },
    safe(({ project_id, theme_id, limit, before, response_format }) => {
      const list = listActivity(db, defined({ projectId: project_id, themeId: theme_id, limit, before }));
      return output(response_format, list, () => F.formatActivity(list));
    }),
  );

  server.registerTool(
    'rp_list_inbox',
    {
      title: '收件箱',
      description: '列出收件箱里待处理的记录。可以用 rp_promote_inbox 把某条转成任务、课题或议题。',
      inputSchema: { response_format: responseFormat },
      annotations: READ,
    },
    safe(({ response_format }) => {
      const inbox = listInbox(db);
      return output(response_format, inbox, () => F.formatInbox(inbox));
    }),
  );

  // ======================= 草稿 =======================

  server.registerTool(
    'rp_draft_week_plan',
    {
      title: '周计划草稿',
      description:
        '按规则生成一周计划草稿：建议的本周重点（上周带入、临近的里程碑、临近截止的课题）、建议加入本周的任务及理由、临近的里程碑和提醒。只读，不会写入。',
      inputSchema: { week_key: weekArg.optional().describe('默认本周') },
      annotations: READ,
    },
    safe(({ week_key }) => text(F.formatWeekPlanDraft(draftWeekPlan(db, week_key ?? thisWeek(), today())))),
  );

  server.registerTool(
    'rp_draft_day_plan',
    {
      title: '日计划草稿',
      description:
        '按规则从当天安排、待接手任务和本周任务池里推荐最重要的 3 件事，并写明理由。只读，不会写入。',
      inputSchema: { date: dateArg.optional().describe('默认今天') },
      annotations: READ,
    },
    safe(({ date }) => text(F.formatDayPlanDraft(draftDayPlan(db, date ?? today(), today())))),
  );

  server.registerTool(
    'rp_draft_week_review',
    {
      title: '周复盘草稿',
      description:
        '按规则整理一周的复盘要点：完成的任务、达成的里程碑、受阻的任务和每日复盘里记下的阻碍、没做完要带入下周的任务、关联的文献。只读，不会写入。',
      inputSchema: { week_key: weekArg.optional().describe('默认本周') },
      annotations: READ,
    },
    safe(({ week_key }) => text(F.formatWeekReviewDraft(draftWeekReview(db, week_key ?? thisWeek())))),
  );

  // ======================= 写入 =======================

  server.registerTool(
    'rp_capture_inbox',
    {
      title: '记进收件箱',
      description: '把一个想法、待读文献或待办随手记进收件箱，稍后再整理。',
      inputSchema: { content: z.string().min(1).max(2000).describe('要记下的内容') },
      annotations: WRITE,
    },
    safe(({ content }) => {
      const item = createInboxItem(db, createInboxInput.parse({ content }));
      return text(`已记入收件箱 #${item.id}。`);
    }),
  );

  server.registerTool(
    'rp_promote_inbox',
    {
      title: '整理收件箱记录',
      description: '把收件箱里的一条记录转成任务、课题或议题。转成任务时必须指定课题或议题之一。',
      inputSchema: {
        item_id: idArg.describe('收件箱记录编号'),
        type: z.enum(['task', 'project', 'theme']),
        title: z.string().max(200).optional().describe('默认取记录的第一行'),
        project_id: idArg.optional().describe('转成任务时归属的课题'),
        theme_id: idArg.optional().describe('转成任务时归属的议题，或转成课题时所属的议题'),
        week_key: weekArg.optional().describe('转成任务时直接排进某周'),
      },
      annotations: WRITE,
    },
    safe((a) => {
      const input = promoteInboxInput.parse(
        defined({
          type: a.type,
          title: a.title,
          projectId: a.project_id,
          themeId: a.theme_id,
          weekKey: a.week_key,
        }),
      );
      const res = promoteInboxItem(db, a.item_id, input);
      const label = { task: '任务', project: '课题', theme: '议题' }[res.created.type];
      return text(`已把收件箱 #${a.item_id} 转成${label} #${res.created.id}。`);
    }),
  );

  server.registerTool(
    'rp_create_task',
    {
      title: '新建任务',
      description:
        '新建一个任务。必须且只能指定 project_id、theme_id、milestone_id 之一作为归属（只给里程碑时自动归到它的课题）。给 scheduled_date 会同时排进那一周。',
      inputSchema: {
        title: z.string().min(1).max(200),
        project_id: idArg.optional(),
        theme_id: idArg.optional(),
        milestone_id: idArg.optional(),
        priority: z.number().int().min(1).max(3).optional().describe('1 高 / 2 中（默认）/ 3 低'),
        week_key: weekArg.optional(),
        scheduled_date: dateArg.optional(),
        estimate_min: z.number().int().min(1).max(1440).optional().describe('预估分钟数'),
        notes: z.string().max(5000).optional(),
      },
      annotations: WRITE,
    },
    safe((a) => {
      const task = createTask(
        db,
        createTaskInput.parse(
          defined({
            title: a.title,
            projectId: a.project_id,
            themeId: a.theme_id,
            milestoneId: a.milestone_id,
            priority: a.priority,
            weekKey: a.week_key,
            scheduledDate: a.scheduled_date,
            estimateMin: a.estimate_min,
            notes: a.notes,
          }),
        ),
      );
      return text(`已新建任务：\n${F.taskLine(task)}`);
    }),
  );

  server.registerTool(
    'rp_update_task',
    {
      title: '修改任务',
      description:
        '修改任务的标题、状态、优先级、排期或归属。排期规则：给 scheduled_date 会同时确定所在周；把 week_key 改到别的周会取消原来的具体日期；传 null 表示清空。',
      inputSchema: {
        task_id: idArg,
        title: z.string().min(1).max(200).optional(),
        status: z.enum(TASK_STATUSES).optional(),
        priority: z.number().int().min(1).max(3).optional(),
        week_key: weekArg.nullable().optional().describe('排进某周；null 表示移出计划'),
        scheduled_date: dateArg.nullable().optional().describe('排到某天；null 表示取消具体日期'),
        project_id: idArg.optional(),
        theme_id: idArg.optional(),
        milestone_id: idArg.nullable().optional(),
        notes: z.string().max(5000).optional(),
      },
      annotations: WRITE,
    },
    safe((a) => {
      const patch = updateTaskInput.parse(
        defined({
          title: a.title,
          status: a.status,
          priority: a.priority,
          weekKey: a.week_key,
          scheduledDate: a.scheduled_date,
          projectId: a.project_id,
          themeId: a.theme_id,
          milestoneId: a.milestone_id,
          notes: a.notes,
        }),
      );
      const task = updateTask(db, a.task_id, patch);
      return text(`已更新任务：\n${F.taskLine(task)}`);
    }),
  );

  server.registerTool(
    'rp_update_project',
    {
      title: '修改课题',
      description: '更新课题的现状描述、状态、截止日期或优先级。"现状"是一段"我们现在到哪了"的说明。',
      inputSchema: {
        project_id: idArg,
        current_status: z.string().max(5000).optional().describe('现状描述，会整体替换原来的内容'),
        status: z.enum(PROJECT_STATUSES).optional(),
        deadline: dateArg.nullable().optional(),
        priority: z.number().int().min(1).max(3).optional(),
      },
      annotations: WRITE,
    },
    safe((a) => {
      const project = updateProject(
        db,
        a.project_id,
        updateProjectInput.parse(
          defined({
            currentStatus: a.current_status,
            status: a.status,
            deadline: a.deadline,
            priority: a.priority,
          }),
        ),
      );
      return text(`已更新课题 #${project.id} ${project.title}。`);
    }),
  );

  server.registerTool(
    'rp_create_milestone',
    {
      title: '新建里程碑',
      description: '在课题下新建一个里程碑。',
      inputSchema: {
        project_id: idArg,
        title: z.string().min(1).max(200),
        due_date: dateArg.optional().describe('目标日期'),
      },
      annotations: WRITE,
    },
    safe(({ project_id, title, due_date }) => {
      const m = createMilestone(
        db,
        project_id,
        createMilestoneInput.parse(defined({ title, dueDate: due_date })),
      );
      return text(`已在课题 #${project_id} 下新建里程碑 #${m.id} ${m.title}。`);
    }),
  );

  server.registerTool(
    'rp_save_week_plan',
    {
      title: '保存本周重点',
      description: '保存（覆盖）某周的重点，最多 5 条。把任务排进本周请用 rp_update_task 设置 week_key。',
      inputSchema: {
        week_key: weekArg.optional().describe('默认本周'),
        focus: z.array(z.string().max(500)).max(5).describe('本周重点，每条一句话'),
      },
      annotations: SAVE,
    },
    safe(({ week_key, focus }) => {
      const week = saveWeekPlan(db, week_key ?? thisWeek(), weekPlanInput.parse({ focus }));
      return text(`已保存 ${week.weekKey} 的本周重点：\n${week.plan.focus.map((f) => `- ${f}`).join('\n')}`);
    }),
  );

  server.registerTool(
    'rp_save_day_plan',
    {
      title: '保存日计划',
      description:
        '设定某天最重要的事（最多 3 个任务编号，会自动排到这一天），或写工作日志。只传其中一项时另一项不变。',
      inputSchema: {
        date: dateArg.optional().describe('默认今天'),
        top_task_ids: z.array(idArg).max(3).optional().describe('最重要的事，按先后顺序'),
        journal: z.string().max(20000).optional().describe('工作日志，会整体替换原来的内容'),
      },
      annotations: SAVE,
    },
    safe(({ date, top_task_ids, journal }) => {
      const day = saveDayPlan(
        db,
        date ?? today(),
        dayPlanInput.parse(defined({ topTaskIds: top_task_ids, journal })),
      );
      return text(
        `已保存 ${F.mdw(day.date)} 的日计划。\n最重要的事：\n${F.taskLines(day.topTasks, { schedule: false }, '（未设）')}`,
      );
    }),
  );

  server.registerTool(
    'rp_save_week_review',
    {
      title: '保存周复盘',
      description: '保存某周的复盘。每次保存都会追加一份不可修改的历史记录。',
      inputSchema: {
        week_key: weekArg.optional().describe('默认本周'),
        wins: z.array(z.string().max(500)).describe('收获与进展'),
        blockers: z.array(z.string().max(500)).describe('阻碍'),
        carry_over: z.array(z.string().max(500)).describe('带入下周的事'),
        reflection: z.string().max(5000).describe('反思'),
      },
      annotations: SAVE,
    },
    safe(({ week_key, wins, blockers, carry_over, reflection }) => {
      const week = saveWeekReview(
        db,
        week_key ?? thisWeek(),
        weekReviewInput.parse({ wins, blockers, carryOver: carry_over, reflection }),
      );
      return text(`已保存 ${week.weekKey} 的周复盘。`);
    }),
  );

  server.registerTool(
    'rp_save_day_review',
    {
      title: '保存晚间复盘',
      description: '保存某天的晚间复盘。每次保存都会追加一份不可修改的历史记录。',
      inputSchema: {
        date: dateArg.optional().describe('默认今天'),
        done: z.string().max(5000).describe('今天完成了什么'),
        blockers: z.string().max(5000).describe('遇到的阻碍'),
        tomorrow: z.string().max(5000).describe('明天先做什么'),
      },
      annotations: SAVE,
    },
    safe(({ date, done, blockers, tomorrow }) => {
      const day = saveDayReview(db, date ?? today(), dayReviewInput.parse({ done, blockers, tomorrow }));
      return text(`已保存 ${F.mdw(day.date)} 的晚间复盘。`);
    }),
  );

  // ======================= 文献与链接 =======================

  const ownerShape = {
    owner_type: z.enum(RESOURCE_OWNER_TYPES).describe('关联到 theme 议题 / project 课题 / task 任务'),
    owner_id: idArg,
  };

  server.registerTool(
    'rp_zotero_search',
    {
      title: '搜索 Zotero 文献',
      description:
        '在用户本机的 Zotero 文献库里按标题、作者或年份搜索。返回条目 key，可用于 rp_link_literature。需要 Zotero 7 正在运行并开启本地 API。',
      inputSchema: {
        query: z.string().min(1).max(200).describe('搜索词，例如作者姓氏、标题关键词或年份'),
        limit: z.number().int().min(1).max(25).default(10),
      },
      annotations: ZOTERO_READ,
    },
    safe(async ({ query, limit }) => text(F.formatZoteroItems(await zotero.search(query, limit)))),
  );

  server.registerTool(
    'rp_zotero_recent',
    {
      title: '最近加入 Zotero 的文献',
      description: '列出最近几天加入 Zotero 的文献，方便把新读的文献关联到课题。',
      inputSchema: {
        days: z.number().int().min(1).max(90).default(7).describe('最近多少天'),
        limit: z.number().int().min(1).max(50).default(20),
      },
      annotations: ZOTERO_READ,
    },
    safe(async ({ days, limit }) => {
      const since = startOfLocalDay(addDays(today(), -days + 1));
      return text(F.formatZoteroItems(await zotero.recent(since, limit)));
    }),
  );

  server.registerTool(
    'rp_link_literature',
    {
      title: '关联文献',
      description: '把一篇 Zotero 文献关联到议题、课题或任务。会从 Zotero 读取作者、年份、标题并保存快照。',
      inputSchema: { ...ownerShape, item_key: z.string().describe('Zotero 条目 key，8 位大写字母或数字') },
      annotations: { ...WRITE, openWorldHint: true },
    },
    safe(async ({ owner_type, owner_id, item_key }) => {
      const r = await linkZoteroItem(db, zotero, { ownerType: owner_type, ownerId: owner_id }, item_key);
      return text(`已把文献"${r.label}"关联到 ${r.ownerTitle ?? `${owner_type} #${owner_id}`}。`);
    }),
  );

  server.registerTool(
    'rp_add_link',
    {
      title: '添加链接',
      description: '给议题、课题或任务添加一个链接，例如 Overleaf 文档、数据集、代码仓库。',
      inputSchema: {
        ...ownerShape,
        url: z.string().describe('以 http:// 或 https:// 开头'),
        label: z.string().max(200).optional().describe('链接名称，例如 Overleaf 初稿'),
      },
      annotations: WRITE,
    },
    safe(({ owner_type, owner_id, url, label }) => {
      const r = addResource(
        db,
        addResourceInput.parse(
          defined({ ownerType: owner_type, ownerId: owner_id, kind: 'url', ref: url, label }),
        ),
      );
      return text(`已添加链接 #${r.id}${r.label ? ` ${r.label}` : ''} 到 ${r.ownerTitle}。`);
    }),
  );

  // ======================= 工作流提示 =======================

  server.registerPrompt(
    'plan_week',
    {
      title: '一起排本周计划',
      description: '根据里程碑、上周复盘和待办池，和你商量本周重点和要做的任务。',
      argsSchema: { week_key: z.string().optional().describe('周编号，例如 2026-W40，默认本周') },
    },
    ({ week_key }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `请帮我排${week_key ? ` ${week_key} ` : '本周'}的计划：
1. 调用 rp_draft_week_plan${week_key ? `（week_key=${week_key}）` : ''} 取草稿，必要时用 rp_get_project 看具体课题。
2. 用简洁的中文告诉我：建议的 3–5 条本周重点、建议加入本周的任务（附一句理由），以及需要注意的提醒。
3. 等我确认或修改后，再调用 rp_save_week_plan 保存重点，并用 rp_update_task 把选中的任务排进这一周。没有我的确认不要写入。`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'plan_day',
    {
      title: '一起排今天',
      description: '从今天的安排、之前没做完的任务和本周任务池里，挑出今天最重要的 3 件事。',
      argsSchema: { date: z.string().optional().describe('日期 YYYY-MM-DD，默认今天') },
    },
    ({ date }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `请帮我排${date ? ` ${date} ` : '今天'}的计划：
1. 调用 rp_draft_day_plan${date ? `（date=${date}）` : ''} 取草稿。
2. 告诉我建议的最重要的 3 件事和理由，以及之前没做完、需要接手的任务。
3. 等我确认后，调用 rp_save_day_plan 保存最重要的事。没有我的确认不要写入。`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    'review_week',
    {
      title: '一起写周复盘',
      description: '整理本周完成了什么、卡在哪里、下周要带入什么，并写一段反思。',
      argsSchema: { week_key: z.string().optional().describe('周编号，默认本周') },
    },
    ({ week_key }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `请帮我写${week_key ? ` ${week_key} ` : '本周'}的周复盘：
1. 调用 rp_draft_week_review${week_key ? `（week_key=${week_key}）` : ''} 取草稿。
2. 把收获、阻碍、带入下周整理成简洁的条目；再问我一两个问题，帮我写一段简短的反思（不要替我编造感受）。
3. 等我确认后调用 rp_save_week_review 保存，并提醒我把"带入下周"的事排进下周。没有我的确认不要写入。`,
          },
        },
      ],
    }),
  );

  return server;
}
