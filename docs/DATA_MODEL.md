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
activity_log  所有写操作的记录
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

每周一条，`week_key` 唯一。`focus` 是本周重点（3 到 5 条）。`review` 是周末复盘，包含收获、阻碍、带入下周的事项和反思。

### daily_plans 日计划

每天一条，`date` 唯一。`top_task_ids` 是当天最重要的任务，`journal` 是工作日志，`review` 是晚间复盘。

### inbox_items 收件箱

`content` 是记下的内容。升级后 `promoted_type` 和 `promoted_id` 指向生成的议题、课题或任务。

### resources 资源

`owner_type` 与 `owner_id` 指向议题、课题或任务。`kind` 是 `url`、`zotero` 或 `file`，`ref` 是链接、Zotero 条目键或文件路径。

### activity_log 活动日志

`entity_type`、`entity_id`、`action`、`payload`、`at`。第二阶段起所有写操作都会记录在这里，用于判断课题是否停滞以及回看历史。

## 存储约定

- 日期（没有时刻）：`'YYYY-MM-DD'` 文本。
- 时刻（创建、更新、完成）：毫秒时间戳整数。
- 周：ISO 周编号 `'YYYY-Www'`，周一为一周的第一天。
- 所有表都有 `created_at` 和 `updated_at`（活动日志只有 `at`）。
- 外键约束在连接时通过 `PRAGMA foreign_keys = ON` 开启。
