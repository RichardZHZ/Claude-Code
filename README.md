# 科研小助理 ResearchPilot

一个本地运行的个人科研管理工具，把**长期目标**和**短期计划**串成一条可追溯的链：

```
研究议题 → 课题 → 里程碑 → 任务 ← 周计划 ← 日计划
```

每天做的事都能追溯到它服务的长期目标。数据只存在你电脑上的一个 SQLite 文件里。可以作为桌面应用使用，也可以在浏览器里打开。

开发计划见 [docs/DEV_PLAN.md](docs/DEV_PLAN.md)，数据模型见 [docs/DATA_MODEL.md](docs/DATA_MODEL.md)，接口见 [docs/API.md](docs/API.md)，Claude 集成见 [docs/MCP.md](docs/MCP.md)，部署与备份见 [docs/DEPLOY.md](docs/DEPLOY.md)。

## 当前进度

- [x] 第〇阶段：项目骨架（数据库表结构、API 服务、前端框架）
- [x] 第一阶段：议题地图、课题详情、本周、今日、收件箱五个页面
- [x] 第二阶段：提醒（健康检查）、复盘历史、课题动态、日历导出
- [x] 第三阶段：在 Claude Code 里使用的小助理（MCP）、Zotero 文献关联
- [x] 第四阶段：一键启动、Docker、自动备份与恢复
- [x] macOS 桌面应用：双击打开，不经过浏览器

## 快速开始

**只想用**：下载 macOS 桌面应用，双击打开，不需要浏览器，也不需要装 Node.js。安装步骤见 [docs/DEPLOY.md](docs/DEPLOY.md#桌面应用macos)。

**从源码运行**：需要 Node.js 22.12 或更高版本，以及 pnpm 10。

```bash
corepack enable          # 如果还没有 pnpm
pnpm install
pnpm db:seed             # 创建数据库并写入一套【示例】数据（可选）
pnpm dev                 # 同时启动 API 和前端
```

然后打开 <http://localhost:5173>。左下角显示"服务与数据库正常"即表示一切就绪。

日常使用不需要开发服务器，一条命令即可：

```bash
pnpm start               # 构建网页并启动，打开 http://localhost:8787
```

也可以用 `pnpm desktop` 在桌面窗口里打开，或者用 Docker：`docker compose up -d --build`。细节见 [docs/DEPLOY.md](docs/DEPLOY.md)。

## 怎么用

1. **议题地图**：先建一个研究议题，再在议题下建课题。课题页里可以加里程碑、写"现状"、在看板上管理任务。
2. **本周**：写下这周的 3–5 个重点，从待办池把任务加入本周。周末在右侧写周复盘。
3. **今日**：从本周任务池挑出最重要的 1–3 件事（点 ☆），完成后打勾。之前没做完的任务会出现在"待接手"。晚上写几句复盘。
4. **收件箱**：任何页面左侧的"随手记"都能一键记下想法，之后在收件箱里把它转为任务、课题或议题。
5. **提醒**：自动检查逾期或有风险的里程碑、太久没动的课题、漏写的周复盘等，今日页顶部也会提示。不想被提醒的课题可以设为"暂停"。
6. **回顾**：每次保存的周复盘、日复盘都会留下一份不可修改的记录，按时间排成你的研究时间线。
7. **日历**：在议题地图点"导出到日历"，把里程碑和截止日期放进你常用的日历应用。
8. **文献**：课题页和议题卡片的"文献与资源"里，可以从 Zotero 搜索并关联文献，也可以添加 Overleaf、数据、代码等链接。本周关联的文献会出现在周复盘里。

任务一定属于某个课题或议题，所以每天做的事都能在议题地图上看到进度。课题页底部的"最近动态"记录了它的每一次变化。

## 和 Claude 一起用

在 Claude Code 里打开这个仓库，批准一次 `researchpilot` 服务器，就可以直接说"帮我排本周计划""帮我写周复盘""把 Oke 1982 关联到热岛课题"。也可以用斜杠命令 `/mcp__researchpilot__plan_week`、`/mcp__researchpilot__plan_day`、`/mcp__researchpilot__review_week`。计划和复盘的草稿由固定规则算出，每条建议都附理由；Claude 写入前会先请你确认。详见 [docs/MCP.md](docs/MCP.md)。

Zotero 需要 7.0 以上，并在"设置 → 高级 → 其他"里勾选"允许此计算机上的其他应用程序与 Zotero 通信"。

## 数据与备份

数据只存在你电脑上的一个数据目录里（macOS 是 `~/Library/Application Support/ResearchPilot/`）。桌面应用、`pnpm start` 和 Claude 读写的是同一份数据。可以用环境变量 `DB_PATH` 指定别的位置。

程序运行时每天自动备份一次到数据目录的 `backups/`，保留最新 30 份；升级数据库结构前、恢复备份前也会各留一份。网页左下角显示上次备份的时间，可以点"立即备份"。恢复时先停掉服务，再运行 `pnpm db:restore <备份文件名>`。详见 [docs/DEPLOY.md](docs/DEPLOY.md)。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm start` | 构建网页并启动，网页和接口都在端口 8787 |
| `pnpm desktop` | 在桌面窗口里打开（开发版，不打包） |
| `pnpm desktop:package --mac --arch arm64,x64` | 打包 macOS 安装包 |
| `pnpm dev` | 开发模式：启动 API（端口 8787）和前端（端口 5173），改代码自动刷新 |
| `pnpm check` | 依次运行代码检查、格式检查、类型检查和测试 |
| `pnpm test` | 运行全部单元测试 |
| `pnpm e2e` | 在真实浏览器里跑端到端测试（使用临时数据库，不影响你的数据） |
| `pnpm build` | 构建前端 |
| `pnpm db:generate` | 修改表结构后生成新的迁移文件 |
| `pnpm db:migrate` | 把数据库升级到最新结构 |
| `pnpm db:seed` | 数据库为空时写入示例数据 |
| `pnpm db:backup` | 立即备份；加 `--list` 列出已有备份 |
| `pnpm db:restore <文件>` | 用备份恢复数据库（先停掉服务） |

## 目录结构

```
apps/
  api/        Hono 后端，所有接口挂在 /api 下
  web/        React 前端（Vite + Tailwind + shadcn/ui）
  mcp/        MCP 服务器，供 Claude Code 调用
  desktop/    Electron 桌面应用，内置上面的服务和页面
packages/
  core/       表结构、迁移、业务逻辑（services/）、前后端共享的校验与类型（contracts.ts）
e2e/          Playwright 端到端测试
docs/         开发计划、数据模型、接口说明、部署与备份
docker/       Docker 启动脚本
data/         Docker 默认的数据目录（不入库）
```

第一次运行 `pnpm e2e` 前需要装一次浏览器：`pnpm exec playwright install chromium`。
