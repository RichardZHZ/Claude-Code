# 数据模型

表结构定义在 `packages/core/src/schema.ts`，迁移 SQL 在 `packages/core/drizzle/`。

## 关系总览

```
themes 研究议题
  ├─< projects 课题            （删除议题时，课题保留但解除关联）
  │     ├─< milestones 里程碑   （删除课题时级联删除）
  │     └─< tasks 任务          （删除课题时级联删除）
  └─< tasks 任务               （议题级探索性任务，例如"读一篇综述"）

tasks.week_key       ──> weekly_plans.week_key   本周要做的任务
tasks.scheduled_date ──> daily_plans.date        排在某天的任务
daily_plans.top_task_ids                         当天最重要的 3 件事

inbox_items   随手记，可升级为议题、课题或任务
resources     资源链接，挂在议题、课题或任务上
activity_log  所有写操作的记录（附课题、议题上下文，不设外键）
```

## 各表字段

### themes 研究议题

长期、开放式的研究方向。

| 字段 | 说明 |
| --- | --- |
| title, description | 名称与说明 |
| core_questions | 这个议题想回答的核心问题，JSON 字符串数组 |
| status | `active` 进行中 / `dormant` 休眠 / `closed` 结束 |
| started_at | 开始日期 |
| review_cadence_days | 多少天回顾一次这个议题，默认 30 |
| countdown_at | 倒计时的截止时刻（毫秒时间戳，精确到秒），可为空。今日页、本周页和桌面小窗按秒显示剩余时间 |

### projects 课题

有明确交付物的长期工作。

| 字段 | 说明 |
| --- | --- |
| theme_id | 所属议题，可为空 |
| kind | `paper` 论文 / `grant` 基金 / `thesis_chapter` 学位论文章节 / `experiment` 实验 / `other` |
| status | `idea` 构想 / `active` 进行中 / `paused` 暂停 / `submitted` 已投稿 / `done` 完成 / `dropped` 放弃 |
| priority | 1 最高，3 最低 |
| started_at, deadline | 开始日期与截止日期 |
| current_status | 一段随时更新的现状描述："我们现在到哪了" |

### milestones 里程碑

课题内带目标日期的阶段节点。字段：`project_id`、`title`、`due_date`、`done_at`、`sort_order`。

### tasks 任务

唯一的工作原子。`project_id` 和 `theme_id` 至少有一个不为空。

| 字段 | 说明 |
| --- | --- |
| project_id / theme_id | 归属的课题或议题 |
| milestone_id | 推进哪个里程碑，可为空 |
| status | `todo` / `doing` / `blocked` / `done` |
| priority | 1 最高，3 最低 |
| estimate_min | 预估分钟数 |
| week_key | 排入哪一周，如 `2026-W40` |
| scheduled_date | 排入哪一天，如 `2026-09-28` |
| done_at | 完成时刻 |

### weekly_plans 周计划

每周一条，`week_key` 唯一。`focus` 是本周重点（3 到 5 条）。

### daily_plans 日计划

每天一条，`date` 唯一。`top_task_ids` 是当天最重要的任务（最多 3 件）。

### inbox_items 收件箱

`content` 是记下的内容。升级后 `promoted_type` 和 `promoted_id` 指向生成的议题、课题或任务。

### resources 文献与链接

挂在议题、课题或任务上。这是多态关联，没有外键：删除议题、课题、任务时，服务层会清理其名下的资源。

| 字段 | 说明 |
| --- | --- |
| owner_type, owner_id | 所属对象：`theme` / `project` / `task` |
| kind | `url` 链接 / `zotero` 文献 / `file` 本地文件 |
| ref | 链接地址、Zotero 条目 key（8 位大写字母或数字）或文件路径 |
| label | 显示名称；文献为简短引文，例如 `Oke (1982) The energetic basis of the urban heat island` |
| meta | 关联时的元数据快照：`{ title, creators, year, itemType, publication, doi, url }`，Zotero 没开时也能显示 |

同一对象的同一 `kind` + `ref` 只能出现一次（唯一索引）。"本周新关联的文献"按 `created_at` 计算。

### activity_log 活动日志

服务层的每个写操作都会记一条，用于判断课题是否停滞、显示课题的"最近动态"。一次写操作只记一条，取最能概括这次变化的动作。

| 字段 | 说明 |
| --- | --- |
| entity_type, entity_id | 被修改的对象：`theme` / `project` / `milestone` / `task` / `weekly_plan` / `daily_plan` / `inbox_item` |
| action | `created` / `updated` / `deleted` / `completed` / `reopened` / `status_changed` / `scheduled` / `unscheduled` / `moved` / `planned` / `promoted` / `linked` / `unlinked`。旧版本还会有 `journaled`、`reviewed`（工作日志和复盘，现已移除），仍能正常显示 |
| project_id, theme_id | 写入时所属的课题和议题。不设外键，对象删除后记录仍在 |
| payload | `{ title, changes: { 字段: [旧值, 新值] }, ... }`。title 是写入时的标题快照 |
| at | 发生时刻 |

中文说明（例如"完成任务"跑回归""）由 `services/activity.ts` 的 `describeActivity` 在读取时生成，不存库。

### 已移除：工作日志与复盘

0.3.0 起去掉了工作日志、日复盘和周复盘：删除了 `reviews` 表，以及 `daily_plans.journal / review / reviewed_at`、`weekly_plans.review / reviewed_at` 列（迁移 `0003`）。升级时会先自动备份，需要找回旧内容时可以打开"升级前备份"查看。

## 存储约定

- 日期（没有时刻）：`'YYYY-MM-DD'` 文本。
- 时刻（创建、更新、完成）：毫秒时间戳整数。
- 周：ISO 周编号 `'YYYY-Www'`，周一为一周的第一天。
- 所有表都有 `created_at` 和 `updated_at`（活动日志只有 `at`）。
- 外键约束在连接时通过 `PRAGMA foreign_keys = ON` 开启。
