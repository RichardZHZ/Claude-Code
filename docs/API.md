# API 接口

所有接口挂在 `/api` 下，收发 JSON。输入校验规则和返回类型定义在 `packages/core/src/contracts.ts`。

出错时返回 `{ "error": "中文说明" }`：参数不合法或违反业务规则为 400，资源不存在为 404，依赖的外部服务（Zotero）不可用为 503。

用 `pnpm start` 或 Docker 运行时，同一个端口还托管网页：`/api` 以外的页面路径都返回网页入口，由前端路由处理。

## 概览

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/health` | 服务与数据库状态、今天日期、本周编号 |
| GET | `/map` | 议题地图：议题 → 课题 → 里程碑，附进度 |
| GET | `/owners` | 新建任务时可选的归属（未结束的议题和课题） |

## 议题

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/themes` | 全部议题 |
| POST | `/themes` | 新建议题 |
| GET | `/themes/:id` | 单个议题 |
| PATCH | `/themes/:id` | 修改议题 |
| DELETE | `/themes/:id` | 删除议题（课题保留，议题下的任务删除） |
| GET | `/countdowns` | 设了倒计时、未结束的议题 `[{ themeId, title, status, at }]`，截止早的在前 |

新建或修改议题时可以传 `countdownAt`：ISO 8601 时刻并带时区，例如 `"2027-06-30T18:00:15+08:00"`；传 `null` 取消倒计时。剩余时间由前端按秒计算，接口只存截止时刻。

## 课题与里程碑

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/projects?themeId=` | 课题列表 |
| POST | `/projects` | 新建课题 |
| GET | `/projects/:id` | 课题详情：里程碑、任务、进度 |
| PATCH | `/projects/:id` | 修改课题（包括"现状"） |
| DELETE | `/projects/:id` | 删除课题及其里程碑和任务 |
| POST | `/projects/:id/milestones` | 新建里程碑 |
| PATCH | `/milestones/:id` | 修改里程碑；`{ "done": true }` 标记完成 |
| DELETE | `/milestones/:id` | 删除里程碑（任务保留） |

## 任务

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/tasks?projectId=&themeId=&weekKey=&scheduledDate=&status=&open=` | 按条件查任务 |
| POST | `/tasks` | 新建任务 |
| GET | `/tasks/:id` | 单个任务 |
| PATCH | `/tasks/:id` | 修改任务：状态、排期、归属等 |
| DELETE | `/tasks/:id` | 删除任务 |

任务规则：

- 必须归属一个课题或一个议题，不能同时归属两者。
- 只给里程碑时，自动归到里程碑所在的课题。
- 排到某天（`scheduledDate`）会自动确定所在周（`weekKey`）。
- 换到别的周会取消原来的具体日期。
- 状态改为 `done` 时记录完成时间，改回其他状态时清除。

## 周计划与日计划

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/weeks/:weekKey` | 周视图：重点、本周任务、待接手、待办池、到期里程碑、本周关联的文献 |
| PUT | `/weeks/:weekKey/plan` | 保存本周重点 `{ focus: string[] }` |
| GET | `/days/:date` | 日视图：最重要的事、当天安排、待接手、本周任务池 |
| PUT | `/days/:date/plan` | 保存最重要的事 `{ topTaskIds }` |

`weekKey` 形如 `2026-W40`，`date` 形如 `2026-09-28`。设为最重要的事的任务会被自动排到当天。

## 收件箱

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/inbox` | 待处理与最近处理过的记录 |
| POST | `/inbox` | 记一条 |
| DELETE | `/inbox/:id` | 删除 |
| POST | `/inbox/:id/promote` | 升级为任务、课题或议题 `{ type, title?, ... }` |

## 提醒、动态、日历

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/checks?today=` | 健康检查：按严重程度排好序的提醒，以及各级数量。`today` 默认取服务器日期，前端会传本机日期 |
| GET | `/activity?projectId=&themeId=&before=&limit=` | 活动记录，附中文说明，按时间倒序；用上一页最后一条的 id 作 `before` 翻页 |
| GET | `/calendar.ics` | 未完成的里程碑和未结束课题的截止日期，ICS 格式，可下载或在日历应用里订阅 |

健康检查规则（阈值在 `packages/core/src/rules/health.ts` 的 `HEALTH_THRESHOLDS`）：

- **里程碑有风险**：7 天内到期且关联任务完成不到 50%；已逾期的一律提醒（紧急）。只看进行中的课题。
- **课题停滞**：进行中的课题超过 14 天没有任何更新。
- **遗留任务**：已完成或放弃的课题、已结束的议题下还有未完成的任务。
- **议题缺少课题**：进行中的议题下没有进行中的课题（议题建立 7 天后才检查）。

## 文献与链接

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/resources?ownerType=&ownerId=` | 某个议题、课题或任务的文献与链接；`ownerType` 为 `theme` / `project` / `task` |
| POST | `/resources` | 添加链接或文件路径 `{ ownerType, ownerId, kind: "url" \| "file", ref, label? }` |
| POST | `/resources/zotero` | 从 Zotero 关联文献 `{ ownerType, ownerId, itemKey }`，会保存作者、年份、标题快照 |
| DELETE | `/resources/:id` | 移除 |
| GET | `/zotero/status` | Zotero 是否可用 `{ available, message }` |
| GET | `/zotero/search?q=&limit=` | 在本机 Zotero 里按标题、作者、年份搜索（后端代理，浏览器不能直接访问 Zotero） |

Zotero 没运行或没开启本地 API 时，`/zotero/*` 和 `/resources/zotero` 返回 503，`error` 里写明开启方法。同一对象重复关联同一条目返回 400。周视图 `GET /weeks/:weekKey` 的 `literature` 字段是本周新关联的文献。

## 备份

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/backups` | 备份设置、最近一次备份、是否太久没备份（`overdue`）、全部备份列表（最新在前） |
| POST | `/backups` | 立即备份一次，并按保留份数清理旧备份，返回这份备份的信息 |

超过两个备份间隔没有备份时 `overdue` 为 `true`。恢复需要先停掉服务，所以没有接口，只能用 `pnpm db:restore`，见 `docs/DEPLOY.md`。
