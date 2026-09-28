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

✅ 已完成。实施中的调整与补充：
- "任务无归属"在数据库层已被 CHECK 约束排除，不可能发生。这条规则改为"遗留任务"：课题或议题已经结束，下面还有没完成的任务。
- 已逾期的里程碑不论进度一律提醒（级别为紧急），因为多半是忘了打勾或需要改日期；临近到期的才看完成率。
- 停滞只检查"进行中"的课题。暂停、构想、已投稿的课题不提醒，想静音某个课题就把它设为暂停。
- 议题建立 7 天内不提醒"缺少课题"，免得刚建就被催。
- 课题的最近活动取活动日志、课题本身、它的任务和里程碑的更新时间中最新的一个，这样第二阶段之前的老数据也能正确判断。
- `activity_log` 增加 `project_id`、`theme_id` 两列作为写入时的上下文，不设外键，课题删除后历史仍在。每条记录生成一句中文说明，课题页显示"最近动态"。
- 复盘快照单独建表 `reviews`，只追加不修改。保存时自动记下当时的完成统计（本周重点、完成数、完成与未完成的任务标题；当天最重要的事是否完成）。回顾页每个周期显示最新一版，并注明修改次数。
- 日历导出包括未完成的里程碑和未结束课题的截止日期，可以下载文件，也可以复制订阅地址。
- 修复：`pnpm dev` 之前没把 `DB_PATH`、`PORT` 等环境变量传给子任务（Turborepo 默认过滤环境变量），现已在 `turbo.json` 里放行。

### Phase 3：小助理（MCP + Zotero）
1. `apps/mcp`：暴露 `list_themes / list_tasks / plan_week / plan_day / review_week / health_report / capture_inbox` 等工具，直接复用 core
2. 在用户 Claude Code 配置中注册（`claude mcp add researchpilot -- node apps/mcp/dist/index.js`）
3. Zotero：读取 `localhost:23119/api/users/0/items`，允许把文献条目挂到议题/课题；周复盘自动汇总本周新增文献
4. AI 起草：草稿结构由 core 生成，Claude 只做自然语言润色（遵循"确定性规则决策，AI 起草"）

✅ 已完成。实施中的调整与补充：
- MCP 服务器不需要构建：`apps/mcp/bin/researchpilot-mcp.mjs` 用 tsx 直接运行源码。仓库根目录的 `.mcp.json` 已登记好，在 Claude Code 里打开这个仓库、批准一次即可使用，不必手动 `claude mcp add`。
- 工具统一用 `rp_` 前缀，共 27 个：读取、草稿、写入、文献四类。读取类支持 `response_format`（markdown / json），列表类支持分页。另提供三个工作流提示 `plan_week`、`plan_day`、`review_week`，在 Claude Code 里显示为斜杠命令。
- 草稿（`services/drafts.ts`）用固定规则给任务打分并写出理由：高优先级、已经在做、里程碑临近或逾期、课题临近截止、之前没做完加分；课题暂停、任务受阻减分。服务器说明和提示词都要求 Claude 写入前先征得用户确认。
- 文献关联复用第〇阶段就建好的 `resources` 表，新增 `meta` 列保存作者、年份、标题等快照，Zotero 没开时也能显示；同一对象不能重复关联同一条目。同一张表也支持普通链接（Overleaf、数据、代码仓库）。
- "本周新增文献"按关联到课题或议题的时间计算，不依赖 Zotero 是否运行。周复盘快照里一并记下。
- Web 端也能用：课题页和议题卡片有"文献与资源"，可以从 Zotero 搜索关联、添加链接。浏览器不能直接访问 Zotero，由后端 `/api/zotero/*` 代理；Zotero 连不上时返回 503 和开启方法。
- 资源是多态关联、没有外键。删除议题、课题、任务时会清理其名下的资源。

### Phase 4：打包与运维
1. Dockerfile + docker-compose（api 服务静态托管 web）
2. SQLite 备份脚本（每日复制 + 保留 30 份）
3. 可选：Tauri 桌面壳；可选：多设备同步（Litestream 到对象存储）

✅ 已完成（可选项暂不做，理由见 `docs/DEPLOY.md`）。实施中的调整与补充：
- 一条命令日常使用：`pnpm start` 构建网页后由 API 在 8787 端口同时托管页面和接口，页面路径交给前端路由。开发仍用 `pnpm dev`。
- 备份不靠系统定时任务，而是在程序里定时：网页服务和 MCP 服务器运行时每小时检查一次，满 24 小时就备份，保留 30 份。这样 macOS、Linux、Docker 都不用另外配置 cron 或 launchd。
- 备份用 SQLite 在线备份接口，运行中也能得到一致的副本；每份备份改为普通日志模式，是一个独立文件。
- 数据库结构升级前自动备份（新建的空库除外）；恢复前把当前库另存一份，并检查备份文件确实是本应用的数据库。
- 网页左下角显示上次备份时间和"立即备份"按钮，超过两个间隔没备份时标红。
- Docker 构建阶段用完整的 `node:22-bookworm` 镜像（自带编译工具），运行阶段用同版本的精简镜像，不需要 apt 安装任何东西。容器以 `data/` 目录所有者的身份运行，宿主机上的文件归属不变。
- 从容器里访问宿主机的 Zotero 受 Zotero 只监听本机的限制，Linux 上通常不可用；需要文献功能时推荐 `pnpm start`。

### 补充：macOS 桌面应用 ✅
用户希望像普通软件一样打开，不经过浏览器，并且下载安装包即可使用。
- 选 Electron 而不是计划里的 Tauri：服务端本来就是 Node，Electron 自带 Node，可以原样运行服务和 MCP 服务器；Tauri 还要另外打包一个 Node 运行时。
- 主进程以子进程运行打包好的服务，窗口加载 `127.0.0.1:8787`（被占用时换空闲端口）。外部链接交给系统浏览器和 Zotero。
- 默认数据目录从仓库的 `data/` 改为系统的用户数据目录，桌面应用、`pnpm start` 和 MCP 共用一份数据。
- MCP 服务器也打进应用，菜单里一键复制 `claude mcp add` 命令，不装 Node.js 也能在 Claude Code 里使用。
- GitHub Actions 在 macOS 上打包 arm64、x64 两个 .dmg 并试启动；推送 `v*` 标签时发布到 Releases。没有 Apple 开发者证书，使用 ad-hoc 签名，第一次打开需手动放行。
- 桌面小窗（0.2.0）：网页新增 `/widget` 页面，桌面应用用一个无边框透明窗口显示它。macOS 上放在普通窗口下一层（`setAlwaysOnTop(true, 'normal', -1)`），像贴在桌面上又能点击；没有用系统小组件（WidgetKit），因为那需要 Swift 另写并且必须有付费的开发者签名。

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
