# 科研小助理 ResearchPilot

一个本地运行的个人科研管理工具，把**长期目标**和**短期计划**串成一条可追溯的链：

```
研究议题 → 课题 → 里程碑 → 任务 ← 周计划 ← 日计划
```

每天做的事都能追溯到它服务的长期目标。数据只存在你电脑上的一个 SQLite 文件里。

开发计划见 [docs/DEV_PLAN.md](docs/DEV_PLAN.md)，数据模型见 [docs/DATA_MODEL.md](docs/DATA_MODEL.md)。

## 当前进度

- [x] 第〇阶段：项目骨架（数据库表结构、API 服务、前端框架）
- [ ] 第一阶段：议题地图、课题详情、本周、今日、收件箱五个页面
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

然后打开 <http://localhost:5173>。右上角显示"服务与数据库正常"即表示一切就绪。

数据库默认在仓库根目录的 `data/researchpilot.db`，可以用环境变量 `DB_PATH` 指定别的位置。备份时复制这个文件即可。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 启动 API（端口 8787）和前端（端口 5173） |
| `pnpm check` | 依次运行代码检查、格式检查、类型检查和测试 |
| `pnpm test` | 运行全部单元测试 |
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
  core/       表结构、数据库、迁移、日期与周编号工具，以及之后的业务逻辑
docs/         开发计划与数据模型说明
data/         本地数据库（不入库）
```
