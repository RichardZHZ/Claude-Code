# CLAUDE.md

科研小助理（ResearchPilot）：单用户、本地运行的科研管理工具。长期目标（研究议题、课题）与短期计划（周计划、日计划）通过"任务"串联。完整规划见 `docs/DEV_PLAN.md`。

## 命令

- `pnpm install`：安装依赖（pnpm workspaces + Turborepo）
- `pnpm dev`：同时启动 API（127.0.0.1:8787）与前端（localhost:5173，/api 代理到 API）
- `pnpm check`：lint + prettier + typecheck + test，提交前必须通过
- `pnpm --filter @researchpilot/core test`：只跑某个包的测试
- `pnpm db:generate`：改完 `packages/core/src/schema.ts` 后生成迁移；`pnpm db:seed`：写示例数据

## 结构与分层

- `packages/core`：唯一放业务逻辑的地方。表结构（Drizzle + better-sqlite3）、迁移、日期与 ISO 周工具、服务层、健康规则。直接以 TS 源码导出，不需要构建。
- `apps/api`：Hono，只做路由、参数校验和序列化，调用 core。`createApp({ db, today })` 可注入数据库和"今天"，测试用 `app.request()`。
- `apps/web`：React 19 + Vite + Tailwind v4 + shadcn/ui（new-york 风格）。路径别名 `@/` 指向 `src/`。
- 之后的 `apps/mcp` 同样只调用 core。API 和 web 不直接依赖 drizzle-orm。

## 约定

- 界面文字、注释、错误信息用中文；代码标识符、文件名、提交信息用英文。
- 日期（无时刻）存 `'YYYY-MM-DD'` 文本；时刻存毫秒时间戳；周用 ISO 周编号 `'YYYY-Www'`，一律用 `packages/core/src/week.ts` 的函数处理，不要手写日期运算。
- 任务必须挂在课题或议题下（数据库 CHECK 约束保证）。周计划、日计划只引用任务，不复制任务。
- 课题进度等派生数据实时计算，不存库。
- 提醒、评分、健康判断用确定性代码实现；AI 只负责起草和润色文字。
- 表结构变更：改 `schema.ts` → `pnpm db:generate --name <描述>` → 提交生成的 `packages/core/drizzle/` 文件。不要手改已提交的迁移。
- TypeScript 锁定 6.0.x，因为 typescript-eslint 尚不支持 7.x。
- shadcn 组件在 `apps/web/src/components/ui/`。可以用 `pnpm dlx shadcn@latest add <组件>` 添加，也可以手动复制官方源码。
- Markdown 文件不经过 Prettier 格式化（中文表格对齐后难以编辑）。
