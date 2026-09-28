# API 接口

所有接口挂在 `/api` 下，收发 JSON。输入校验规则和返回类型定义在 `packages/core/src/contracts.ts`。

出错时返回 `{ "error": "中文说明" }`：参数不合法或违反业务规则为 400，资源不存在为 404。

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
| GET | `/weeks/:weekKey` | 周视图：重点、本周任务、待接手、待办池、到期里程碑、复盘 |
| PUT | `/weeks/:weekKey/plan` | 保存本周重点 `{ focus: string[] }` |
| PUT | `/weeks/:weekKey/review` | 保存周复盘 |
| GET | `/days/:date` | 日视图：最重要的事、当天安排、待接手、本周任务池、日志、复盘 |
| PUT | `/days/:date/plan` | 保存最重要的事 `{ topTaskIds }` 或日志 `{ journal }` |
| PUT | `/days/:date/review` | 保存晚间复盘 |

`weekKey` 形如 `2026-W40`，`date` 形如 `2026-09-28`。设为最重要的事的任务会被自动排到当天。

## 收件箱

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/inbox` | 待处理与最近处理过的记录 |
| POST | `/inbox` | 记一条 |
| DELETE | `/inbox/:id` | 删除 |
| POST | `/inbox/:id/promote` | 升级为任务、课题或议题 `{ type, title?, ... }` |

## 提醒、动态、回顾、日历

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/checks?today=` | 健康检查：按严重程度排好序的提醒，以及各级数量。`today` 默认取服务器日期，前端会传本机日期 |
| GET | `/activity?projectId=&themeId=&before=&limit=` | 活动记录，附中文说明，按时间倒序；用上一页最后一条的 id 作 `before` 翻页 |
| GET | `/reviews?kind=&before=&limit=` | 复盘时间线：每个周期的最新一版，附保存次数；`kind` 为 `week` 或 `day` |
| GET | `/calendar.ics` | 未完成的里程碑和未结束课题的截止日期，ICS 格式，可下载或在日历应用里订阅 |

健康检查规则（阈值在 `packages/core/src/rules/health.ts` 的 `HEALTH_THRESHOLDS`）：

- **里程碑有风险**：7 天内到期且关联任务完成不到 50%；已逾期的一律提醒（紧急）。只看进行中的课题。
- **课题停滞**：进行中的课题超过 14 天没有任何更新。
- **周复盘**：上周有计划或任务却没复盘；本周从周五起也提醒一次。
- **遗留任务**：已完成或放弃的课题、已结束的议题下还有未完成的任务。
- **议题缺少课题**：进行中的议题下没有进行中的课题（议题建立 7 天后才检查）。
