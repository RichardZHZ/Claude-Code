# 科研小助理 ResearchPilot

一个本地运行的个人科研管理工具，把**长期目标**和**短期计划**串成一条可追溯的链：

```
研究议题 → 课题 → 里程碑 → 任务 ← 周计划 ← 日计划
```

每天做的事都能追溯到它服务的长期目标。数据只存在你电脑上的一个 SQLite 文件里。

开发计划见 [docs/DEV_PLAN.md](docs/DEV_PLAN.md)，数据模型见 [docs/DATA_MODEL.md](docs/DATA_MODEL.md)，接口见 [docs/API.md](docs/API.md)。

## 当前进度

- [x] 第〇阶段：项目骨架（数据库表结构、API 服务、前端框架）
- [x] 第一阶段：议题地图、课题详情、本周、今日、收件箱五个页面
- [ ] 第二阶段：复盘记录与健康检查
- [ ] 第三阶段：Claude 小助理（MCP）与 Zotero 联动
- [ ] 第四阶段：打包部署与自动备份

## 快速开始

需要 Node.js 22.12 或更高版本，以及 pnpm 10。

```bash
corepack enable          # 如果还没有 pnpm
pnpm install
pnpm db:seed             # 创建数据库并写入一套【示例】数据（可选）
pnpm dev                 # 同时启动 API 和前端
```

然后打开 <http://localhost:5173>。左下角显示"服务与数据库正常"即表示一切就绪。

## 怎么用

1. **议题地图**：先建一个研究议题，再在议题下建课题。课题页里可以加里程碑、写"现状"、在看板上管理任务。
2. **本周**：写下这周的 3–5 个重点，从待办池把任务加入本周。周末在右侧写周复盘。
3. **今日**：从本周任务池挑出最重要的 1–3 件事（点 ☆），完成后打勾。之前没做完的任务会出现在"待接手"。晚上写几句复盘。
4. **收件箱**：任何页面左侧的"随手记"都能一键记下想法，之后在收件箱里把它转为任务、课题或议题。

任务一定属于某个课题或议题，所以每天做的事都能在议题地图上看到进度。

数据库默认在仓库根目录的 `data/researchpilot.db`，可以用环境变量 `DB_PATH` 指定别的位置。备份时复制这个文件即可。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 启动 API（端口 8787）和前端（端口 5173） |
| `pnpm check` | 依次运行代码检查、格式检查、类型检查和测试 |
| `pnpm test` | 运行全部单元测试 |
| `pnpm e2e` | 在真实浏览器里跑端到端测试（使用临时数据库，不影响你的数据） |
| `pnpm build` | 构建前端 |
| `pnpm db:generate` | 修改表结构后生成新的迁移文件 |
| `pnpm db:migrate` | 把数据库升级到最新结构 |
| `pnpm db:seed` | 数据库为空时写入示例数据 |

## 目录结构

```
apps/
  api/        Hono 后端，所有接口挂在 /api 下
  web/        React 前端（Vite + Tailwind + shadcn/ui）
packages/
  core/       表结构、迁移、业务逻辑（services/）、前后端共享的校验与类型（contracts.ts）
e2e/          Playwright 端到端测试
docs/         开发计划、数据模型、接口说明
data/         本地数据库（不入库）
```

第一次运行 `pnpm e2e` 前需要装一次浏览器：`pnpm exec playwright install chromium`。
