# 在 Claude Code 里使用科研小助理

科研小助理带一个 MCP 服务器，让 Claude 能读写你的研究计划。你可以直接说"帮我排下周计划""把这篇文献关联到热岛课题"。

## 启用

用桌面应用的话，点菜单"帮助 → 在 Claude Code 中使用…"，把复制的命令粘贴到终端运行一次即可，不需要仓库，也不需要装 Node.js。

用源码的话，在 Claude Code 里打开这个仓库。根目录的 `.mcp.json` 已经登记了服务器 `researchpilot`，第一次使用时 Claude Code 会请你批准。批准后输入 `/mcp` 可以看到它的状态。

服务器和桌面应用、网页用的是同一个数据库（macOS 默认在 `~/Library/Application Support/ResearchPilot/`），可以同时开着。

想在别的目录也能用，可以把它登记为你的个人服务器（把路径换成你电脑上仓库的实际位置）：

```bash
claude mcp add --scope user researchpilot -- node /path/to/Claude-Code/apps/mcp/bin/researchpilot-mcp.mjs
```

可用的环境变量：

| 变量 | 作用 | 默认 |
| --- | --- | --- |
| `DB_PATH` | 数据库文件位置 | 用户数据目录里的 `researchpilot.db`，见 `docs/DEPLOY.md` |
| `ZOTERO_URL` | Zotero 本地 API 地址 | `http://127.0.0.1:23119` |
| `BACKUP_DIR`、`BACKUP_KEEP`、`BACKUP_INTERVAL_HOURS`、`AUTO_BACKUP` | 自动备份设置，见 `docs/DEPLOY.md` | 每 24 小时一次，保留 30 份 |

MCP 服务器运行时也会按时自动备份，只用 Claude、不开网页也不会漏掉备份。

## 常用说法

- "看看我今天该做什么" → 概览、日计划草稿
- "帮我排本周计划" 或斜杠命令 `/mcp__researchpilot__plan_week`
- "帮我挑今天最重要的三件事" 或 `/mcp__researchpilot__plan_day`
- "帮我写这周的复盘" 或 `/mcp__researchpilot__review_week`
- "热岛论文那个课题现在进展怎样" → 课题详情、最近动态
- "把刚读的 Oke 1982 关联到热岛课题" → 搜索 Zotero、关联文献
- "记一下：试试换一种识别策略" → 记进收件箱

计划和复盘的草稿由固定规则算出，每条建议都附理由。Claude 负责整理成自然的文字、和你商量。所有写入都会先给你看、等你确认。

## 工具一览

| 类别 | 工具 | 作用 |
| --- | --- | --- |
| 读取 | `rp_get_overview` | 今天的安排、本周重点与完成度、提醒、收件箱数量 |
| | `rp_list_themes` | 议题地图：议题 → 课题 → 里程碑与进度 |
| | `rp_get_project` | 课题详情：现状、里程碑、任务、文献与链接、最近动态 |
| | `rp_list_tasks` | 按课题、议题、周、日期、状态筛选任务（分页） |
| | `rp_get_week` / `rp_get_day` | 周视图、日视图 |
| | `rp_health_report` | 健康检查提醒 |
| | `rp_list_reviews` / `rp_list_activity` / `rp_list_inbox` | 复盘历史、活动记录、收件箱 |
| 草稿 | `rp_draft_week_plan` | 建议的本周重点、建议加入本周的任务及理由 |
| | `rp_draft_day_plan` | 建议的今天最重要的 3 件事及理由 |
| | `rp_draft_week_review` | 本周完成、达成的里程碑、阻碍、带入下周、关联的文献 |
| 写入 | `rp_save_week_plan` / `rp_save_day_plan` | 保存本周重点、今天最重要的事或工作日志 |
| | `rp_save_week_review` / `rp_save_day_review` | 保存复盘（每次保存都留下历史记录） |
| | `rp_create_task` / `rp_update_task` | 新建、修改任务（状态、排期、归属） |
| | `rp_update_project` / `rp_create_milestone` | 更新课题现状与状态、新建里程碑 |
| | `rp_capture_inbox` / `rp_promote_inbox` | 记进收件箱、整理成任务/课题/议题 |
| 文献 | `rp_zotero_search` / `rp_zotero_recent` | 搜索 Zotero、列出最近加入的文献 |
| | `rp_link_literature` / `rp_add_link` | 关联文献、添加链接 |

读取类工具可以传 `response_format: "json"` 拿到完整的结构化数据。

## Zotero 设置

需要 Zotero 7。打开 Zotero 的"设置 → 高级 → 其他"，勾选"允许此计算机上的其他应用程序与 Zotero 通信"。检查是否生效：

```bash
curl "http://127.0.0.1:23119/api/users/0/items/top?limit=1"
```

有 JSON 返回就说明可以用了。Zotero 没开时，文献相关的工具会给出提示，其他功能不受影响；已经关联的文献也照常显示，因为关联时保存了作者、年份、标题的快照。

## 开发

- 源码：`apps/mcp/src/server.ts`（工具与提示）、`format.ts`（给 Claude 看的 Markdown）
- 测试：`pnpm --filter @researchpilot/mcp test`，用 SDK 的内存传输连接真实的客户端和服务器
- 手动调试：`npx @modelcontextprotocol/inspector node apps/mcp/bin/researchpilot-mcp.mjs`
