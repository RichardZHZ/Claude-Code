# 科研管理小助理（ResearchPilot）开发计划

## Context

用户需要一个个人科研管理助手，核心是把**长期目标**（研究议题 → 具体课题）和**短期计划**（周计划 → 日计划）串成一条可追溯的链，避免"每天忙但不知道推进了哪个长期目标"。当前仓库 `richardzhz/claude-code` 为空（仅有 `.claude/settings.local.json`），是从零开始的项目。用户环境中已配置 `zotero-mcp`，说明后续需要文献（Zotero）联动，并且习惯用 Claude Code 作为工作入口。

### 参考项目调研结论（GitHub）

| 项目 | 可借鉴点 | 不足 |
|---|---|---|
| [obsidian-research-flow](https://github.com/nachiket273/obsidian-research-flow) | 6 类对象（Project/Task/Idea/Daily/Reading/Career）用 frontmatter 互链；任务 `work_date` 自动出现在日记；项目进度 = 已完成任务/总任务；"14 天无活动即 stale"健康检查；周报自动生成 | 只有"项目"一层长期目标，没有"议题"层；依赖 Obsidian |
| [academic_project_tracker](https://github.com/jennamk14/academic_project_tracker) | Node+Express+SQLite+React+Vite+Tailwind，单文件数据库易备份；Deadlines / Goals(月度、学期) / Resources 链接（Overleaf、GDocs） | 目标层与任务层没有强关联；无日/周计划 |
| [SYU8384/academic-project-management](https://github.com/SYU8384/academic-project-management) | **Program（研究方向）vs Project（一篇论文/一章）两级结构**，正好对应"议题 vs 课题"；每个单元有 `CURRENT_STATUS.md` 回答"我们到哪了"；带日期的 history 记录决策 | 纯文件夹 + 脚本，没有 UI，没有日/周节律 |
| [open-okr](https://github.com/open-okr/open-okr) | Cycle（年/季）→ Objective → KR → Initiative → Check-in 的层级；**"规则、提醒、评分全部是确定性代码，AI 只负责起草"**；Check-in 是不可变快照 | 面向团队，过重 |
| Zotero 7 [Local API](https://www.zotero.org/support/dev/web_api/v3/local_api) / [BBT JSON-RPC](https://retorque.re/zotero-better-bibtex/exporting/json-rpc/index.html) | `localhost:23119/api/` 可离线读本地文献库，无速率限制 | 需在 Zotero 设置里勾选允许本机应用访问 |

综合出的搭建逻辑：**四层目标链（议题 → 课题 → 周 → 日）+ 任务作为唯一的"工作原子"贯穿各层 + 确定性健康检查 + AI 仅起草**。

---

## 产品定义

### 目标层级与关系

```
ResearchTheme 研究议题（长期，开放式，多年）
  └── Project 课题（长期，有明确交付：论文/基金/学位论文章节/实验）
        └── Milestone 里程碑（有目标日期）
              └── Task 任务（唯一工作原子）
WeeklyPlan 周计划 ── 选取若干 Task 作为本周重点，周末复盘
DailyPlan  日计划 ── 从本周任务中选 Top 3，当日日志，晚间复盘
```

- Task 必须归属 Project **或** Theme（议题级的探索性任务如"读 X 领域综述"允许直接挂议题）。
- 周/日计划不复制任务，只**引用**任务（`links over duplication`，来自 ResearchFlow）。
- Project 进度 = 已完成任务 / 总任务，派生字段，不手填。
- 每次周复盘、日复盘写入不可变的 `Review` 记录（来自 open-okr 的 check-in 思路），形成研究历史。

### 核心视图（MVP）

1. **今日**：Top 3 任务、本周剩余任务池、当日日志、昨日未完成自动待接手
2. **本周**：周重点（3–5 条）、按课题分组的任务看板、周末复盘表单（进展/阻碍/下周带入/反思）
3. **议题地图**：议题 → 课题 → 里程碑树状图，显示进度、截止、健康状态
4. **课题详情**：Kanban（todo/doing/blocked/done）、里程碑时间线、资源链接、历史记录
5. **收件箱**：随手记想法，之后一键升级为任务/课题/议题
6. **健康检查面板**（确定性规则）：
   - 课题 >14 天无任务活动 → stale
   - 议题下无进行中课题 → 休眠提醒
   - 里程碑 7 天内到期但完成率 <50% → 风险
   - 任务无归属 → 孤儿
   - 本周计划未做复盘 → 提醒

### "小助理"能力（AI 只起草，规则做决策）

通过 **MCP server** 把服务层暴露给 Claude Code，让用户在 Claude 里直接说"帮我生成下周计划"：
- `plan_week`：读取即将到期的里程碑 + 上周未完成任务 + 课题优先级，起草周重点草稿供确认
- `plan_day`：从本周任务池推荐 Top 3
- `review_week` / `review_day`：根据当周完成记录生成复盘草稿
- `health_report`：输出健康检查结果
- Zotero：按议题/课题关联文献条目，"这周读了什么"进入周复盘

---

## 技术方案（推荐）

**本地优先、单用户、单个 SQLite 文件、可选 Docker。** 用 TypeScript monorepo，服务层只写一次，Web API 和 MCP server 共用。

| 层 | 选型 | 理由 |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | 与 open-okr 一致，Claude Code 生成友好 |
| 数据 | SQLite + Drizzle ORM（drizzle-kit 迁移） | 单文件备份；schema 即类型 |
| 核心 | `packages/core`：schema、Zod 校验、服务层、健康规则 | Web / MCP / CLI 共用 |
| API | `apps/api`：Hono（Node） | 轻、类型安全，可用 hono/zod-openapi 生成文档 |
| 前端 | `apps/web`：React + Vite + Tailwind + shadcn/ui + TanStack Query/Router | 与两个参考项目一致 |
| 助理 | `apps/mcp`：`@modelcontextprotocol/sdk` stdio server | 接入用户现有 Claude Code 工作流 |
| 集成 | Zotero Local API（`localhost:23119/api/users/0/items`）；ICS 导出 | 第三阶段 |
| 测试 | Vitest（core/api）、Playwright（web 关键流程） | |
| 打包 | Dockerfile + docker-compose；后期可选 Tauri 桌面壳 | |

### 仓库结构

```
.
├── apps/
│   ├── api/          # Hono 服务，REST + OpenAPI
│   ├── web/          # React SPA
│   └── mcp/          # MCP server（stdio），供 Claude Code 调用
├── packages/
│   └── core/         # drizzle schema、services、health rules、zod types
├── docs/
│   ├── DEV_PLAN.md   # 本计划落库
│   └── DATA_MODEL.md
├── docker-compose.yml
├── package.json / pnpm-workspace.yaml / turbo.json
├── tsconfig.base.json / eslint.config.js / .prettierrc.json   # 共享配置放在根目录
└── CLAUDE.md         # 项目约定，便于后续用 Claude Code 迭代
```

### 数据模型（`packages/core/src/schema.ts`）

- `themes`: id, title, description, core_questions(text/json), status(active|dormant|closed), started_at, review_cadence_days, created_at, updated_at
- `projects`: id, theme_id(FK, nullable), title, kind(paper|grant|thesis_chapter|experiment|other), status(idea|active|paused|submitted|done|dropped), priority(1–3), started_at, deadline, description, current_status(text，对应 CURRENT_STATUS.md)
- `milestones`: id, project_id, title, due_date, done_at, sort_order
- `tasks`: id, project_id(nullable), theme_id(nullable), milestone_id(nullable), title, notes, status(todo|doing|blocked|done), priority, estimate_min, scheduled_date, week_key(ISO `2026-W40`), done_at, created_at, updated_at；约束：project_id 与 theme_id 至少一个非空
- `weekly_plans`: id, week_key(unique), focus(json: 3–5 条), review(json: wins/blockers/carry_over/reflection, nullable), reviewed_at
- `daily_plans`: id, date(unique), top_task_ids(json), journal(text), review(json, nullable), reviewed_at
- `inbox_items`: id, content, promoted_to(type,id nullable), created_at
- `resources`: id, owner_type(theme|project|task), owner_id, kind(url|zotero|file), ref, label
- `activity_log`: id, entity_type, entity_id, action, payload(json), at  —— 供 stale 判定与历史回放

### 服务层与规则（`packages/core/src/services/`, `rules/`）

- `themes.ts / projects.ts / tasks.ts / plans.ts / inbox.ts`：CRUD + 状态机
- `progress.ts`：项目进度、里程碑完成率（派生）
- `rules/health.ts`：上文 5 条健康规则，纯函数、可单测
- `rules/carryover.ts`：昨日未完成任务自动进入今日候选；上周未完成进入本周候选
- `drafts/`：`draftWeeklyPlan()`、`draftDailyTop3()`、`draftWeeklyReview()` 返回结构化草稿，MCP 层再交给 Claude 润色

---

## 分阶段实施

### Phase 0：脚手架 ✅ 已完成
1. 初始化 pnpm monorepo、Turborepo、tsconfig、eslint/prettier
2. `packages/core`：drizzle + SQLite，写 schema、首个迁移、seed 脚本
3. `apps/api`：Hono 启动、健康检查路由 `/api/health`
4. `apps/web`：Vite + React + Tailwind + shadcn 初始化
5. 写 `CLAUDE.md`、`docs/DEV_PLAN.md`（本文件）、`docs/DATA_MODEL.md`
6. 首次 commit/push 到 `claude/cool-edison-ecc9fg`

实施中的调整：
- 共享的 tsconfig、ESLint、Prettier 配置直接放在仓库根目录，没有单独建 `packages/config` 包，结构更简单。
- TypeScript 锁定 6.0.x，因为 typescript-eslint 目前只支持到 6.0。
- 开发用的云环境无法访问 ui.shadcn.com，shadcn 的配置和按钮、卡片、徽标三个组件按官方源码手动写入。本地开发时可以正常用 `shadcn add` 添加组件。
- 主键用自增整数而不是 UUID，方便在界面和 Claude 对话里直接说"任务 12"。
- 状态类枚举只在应用层校验，数据库层只对"任务必须有归属"和"优先级 1–3"加了 CHECK 约束，避免以后增减枚举值时要重建表。

### Phase 1：MVP —— 目标链跑通 ✅ 已完成
1. core：themes / projects / milestones / tasks 服务 + Vitest 单测
2. api：REST 路由（`/themes`, `/projects`, `/tasks`, `/weeks/:weekKey`, `/days/:date`, `/inbox`）
3. web：
   - 议题地图页（树 + 进度条）
   - 课题详情页（Kanban + 里程碑）
   - 本周页（周重点 + 任务池 + 复盘表单）
   - 今日页（Top 3 + 日志 + 昨日待接手）
   - 收件箱
4. Playwright：新建议题→课题→任务→排入本周→排入今日→完成 的端到端流

实施中的调整与补充：
- 周、日接口路径改为更短的 `/weeks/:weekKey` 和 `/days/:date`，完整列表见 `docs/API.md`。
- 前后端共享 `packages/core/src/contracts.ts`（输入校验与返回类型）；前端只导入类型，枚举从 `enums.ts` 导入，避免把 zod 打包进前端。ESLint 规则会拦住误用。
- 排期规则：排到某天会自动确定所在周；换到别的周会取消原来的具体日期；设为"最重要的事"会自动排到当天。
- "待接手"不限于昨天或上周，而是所有更早日期或更早周里没做完的任务。
- 周复盘、日复盘在还没填写时，用本周或当天完成、未完成的任务预填，保存后覆盖。复盘的不可变历史记录仍按计划放在第二阶段。
- 看板用浏览器原生拖放；手机上拖放不方便，所以每张卡片另有菜单可以切换状态、加入本周、排到今天。
- 侧边栏加了"随手记"输入框，任何页面都能一键记进收件箱。
- `activity_log` 表已建好，但写入仍按计划在第二阶段接入。

### Phase 2：复盘与健康
1. `rules/health.ts` 五条规则 + 面板
2. 周/日复盘不可变记录、历史时间线视图
3. `activity_log` 接入所有写操作
4. ICS 导出里程碑截止日

### Phase 3：小助理（MCP + Zotero）
1. `apps/mcp`：暴露 `list_themes / list_tasks / plan_week / plan_day / review_week / health_report / capture_inbox` 等工具，直接复用 core
2. 在用户 Claude Code 配置中注册（`claude mcp add researchpilot -- node apps/mcp/dist/index.js`）
3. Zotero：读取 `localhost:23119/api/users/0/items`，允许把文献条目挂到议题/课题；周复盘自动汇总本周新增文献
4. AI 起草：草稿结构由 core 生成，Claude 只做自然语言润色（遵循"确定性规则决策，AI 起草"）

### Phase 4：打包与运维
1. Dockerfile + docker-compose（api 服务静态托管 web）
2. SQLite 备份脚本（每日复制 + 保留 30 份）
3. 可选：Tauri 桌面壳；可选：多设备同步（Litestream 到对象存储）

---

## 验证方式

- `pnpm test`：core 服务与健康规则单测（重点：进度派生、carry-over、5 条规则边界）
- `pnpm dev` 后访问 `http://localhost:5173`，手动走通"议题→课题→里程碑→任务→周→日→完成→复盘"
- `pnpm e2e`：Playwright 覆盖上述主流程
- MCP：`claude mcp add` 后在 Claude Code 里执行"帮我生成下周计划"，确认返回草稿引用了真实任务 id
- Zotero：开启本地 API 后 `curl localhost:23119/api/users/0/items?limit=1` 有返回，UI 中可搜索并挂接

## 已确认的决定

- 独立 Web 应用，不依赖也不兼容 Obsidian（用户不使用 Obsidian），不做 Markdown 导出

## 仍待确认的假设

1. 单用户、本地优先，不做登录与多租户
2. 技术栈 TypeScript 全栈（用户环境同时有 Node 与 Python，选 TS 是为了服务层在 Web/MCP 间复用）
3. 界面语言中文优先，代码与标识符英文
