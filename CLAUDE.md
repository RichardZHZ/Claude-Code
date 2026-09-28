# CLAUDE.md

科研小助理（ResearchPilot）：单用户、本地运行的科研管理工具。长期目标（研究议题、课题）与短期计划（周计划、日计划）通过"任务"串联。完整规划见 `docs/DEV_PLAN.md`，接口见 `docs/API.md`。

## 命令

- `pnpm install`：安装依赖（pnpm workspaces + Turborepo）
- `pnpm dev`：同时启动 API（127.0.0.1:8787）与前端（localhost:5173，/api 代理到 API）
- `pnpm check`：lint + prettier + typecheck + test，提交前必须通过
- `pnpm e2e`：Playwright 端到端测试，自带临时数据库、假 Zotero 和独立端口（API 8799、前端 5199、Zotero 23199）。云环境里用 `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm e2e`
- `pnpm --filter @researchpilot/core test`：只跑某个包的测试
- `pnpm db:generate`：改完 `packages/core/src/schema.ts` 后生成迁移；`pnpm db:seed`：写示例数据

## 结构与分层

- `packages/core`：唯一放业务逻辑的地方。
  - `schema.ts` 表结构；`enums.ts` 状态取值与中文名；`week.ts` 日期与 ISO 周工具。
  - `contracts.ts` 前后端共享的 zod 输入校验和 JSON 返回类型（`Wire<T>` 把 Date 转成字符串）。
  - `types.ts` 服务层返回的视图类型；`errors.ts` 的 `DomainError` 由 API 映射为 400/404。
  - `services/` 按领域划分：tasks、themes、projects、milestones、map、owners、plans、inbox、activity、health、reviews、calendar、resources、drafts。函数第一个参数是 `Conn`（连接或事务）。
  - `zotero.ts` Zotero 本地 API 只读客户端（可注入 `fetch`）；`testing/fake-zotero.ts` 是测试用的假 Zotero。
  - `services/drafts.ts` 周计划、日计划、周复盘草稿：确定性打分并写出理由，供 MCP 和 Claude 润色。
  - `rules/health.ts` 健康检查的纯函数规则与阈值；`services/health.ts` 负责从数据库组装快照。
  - 入口：`@researchpilot/core`（服务端）、`/contracts`、`/enums`、`/week`、`/health-rules`（前端可用）、`/testing`（仅测试）。
- `apps/api`：Hono，只做路由、参数校验（`validate.ts`）和序列化，调用 core。路由按领域放在 `src/routes/`。`createApp({ db, today })` 可注入数据库和"今天"，测试用 `app.request()`。
- `apps/web`：React 19 + Vite + Tailwind v4 + shadcn/ui（new-york 风格）+ TanStack Router（代码式路由，`src/router.tsx`）+ TanStack Query。路径别名 `@/` 指向 `src/`。
  - `src/pages/` 七个页面（今日、本周、议题地图、课题、收件箱、提醒、回顾）；`src/components/tasks/` 任务相关的复用组件；`src/lib/queries.ts` 查询与写操作（`useAction` 成功后刷新全部数据并弹提示）。
- `apps/mcp`：stdio MCP 服务器（`@modelcontextprotocol/sdk`），只调用 core。`src/server.ts` 注册 `rp_` 前缀的工具和三个提示，`src/format.ts` 输出给 Claude 看的 Markdown；`bin/researchpilot-mcp.mjs` 用 tsx 直接运行源码，根目录 `.mcp.json` 已登记。stdio 下标准输出只能传协议消息，日志写 stderr。测试用 SDK 的 `InMemoryTransport`。
- API、web、mcp 都不直接依赖 drizzle-orm。

## 约定

- 界面文字、注释、错误信息用中文；代码标识符、文件名、提交信息用英文。
- 日期（无时刻）存 `'YYYY-MM-DD'` 文本；时刻存毫秒时间戳；周用 ISO 周编号 `'YYYY-Www'`，一律用 `packages/core/src/week.ts` 的函数处理，不要手写日期运算。
- 任务必须挂在课题或议题下（数据库 CHECK 约束 + 服务层校验）。周计划、日计划只引用任务，不复制任务。
- 排期规则集中在 `services/tasks.ts` 的 `updateTask`：排到某天会确定所在周；换周会取消具体日期。
- 课题进度等派生数据实时计算，不存库。
- 服务层每个写操作都要调用 `logActivity`（`services/activity.ts`），带上 `projectId` / `themeId` 上下文和 `payload.title`；没有实际变化时不记。新增动作要同时更新 `describeActivity` 的中文说明和 `enums.ts` 的 `ACTIVITY_ACTIONS`。
- `reviews` 表只追加、不修改不删除；复盘的最新版本同时写在 `weekly_plans` / `daily_plans` 里。
- `resources` 是多态关联，没有外键：删除议题、课题、任务的服务函数要调用 `pruneOrphanResources`。
- MCP 写入工具要复用 contracts 里的 zod 校验；工具描述和服务器说明要求 Claude 写入前先征得用户确认，新增写入工具时保持这一点。
- `pnpm dev` 经 Turborepo 启动，需要传给子任务的环境变量必须列在 `turbo.json` 的 `passThroughEnv` 里。
- 提醒、评分、健康判断用确定性代码实现；AI 只负责起草和润色文字。
- 前端只能 `import type` 自 `@researchpilot/core/contracts`，运行时的枚举和常量从 `/enums` 导入（ESLint 会检查），避免把 zod 打包进前端。
- 表结构变更：改 `schema.ts` → `pnpm db:generate --name <描述>` → 提交生成的 `packages/core/drizzle/` 文件。不要手改已提交的迁移。
- TypeScript 锁定 6.0.x，因为 typescript-eslint 尚不支持 7.x。
- shadcn 组件在 `apps/web/src/components/ui/`。可以用 `pnpm dlx shadcn@latest add <组件>` 添加，也可以手动复制官方源码。
- 端到端测试用 `data-testid`、可访问名称（aria-label）定位元素；改界面文字时同步更新 `e2e/`。
- Markdown 文件不经过 Prettier 格式化（中文表格对齐后难以编辑）。
