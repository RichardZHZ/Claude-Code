// 各类状态与类型的取值，以及对应的中文名称。
// 表结构（schema.ts）、输入校验（contracts.ts）和前端都从这里取值。

export const THEME_STATUSES = ['active', 'dormant', 'closed'] as const;
export const PROJECT_KINDS = ['paper', 'grant', 'thesis_chapter', 'experiment', 'other'] as const;
export const PROJECT_STATUSES = ['idea', 'active', 'paused', 'submitted', 'done', 'dropped'] as const;
export const TASK_STATUSES = ['todo', 'doing', 'blocked', 'done'] as const;
export const ENTITY_TYPES = [
  'theme',
  'project',
  'milestone',
  'task',
  'weekly_plan',
  'daily_plan',
  'inbox_item',
] as const;
/** 活动日志里的动作。一次写操作只记一条，取最能概括这次变化的动作。 */
export const ACTIVITY_ACTIONS = [
  'created',
  'updated',
  'deleted',
  'completed',
  'reopened',
  'status_changed',
  'scheduled',
  'unscheduled',
  'moved',
  'planned',
  'journaled',
  'reviewed',
  'promoted',
] as const;
export const REVIEW_KINDS = ['week', 'day'] as const;
export const RESOURCE_OWNER_TYPES = ['theme', 'project', 'task'] as const;
export const RESOURCE_KINDS = ['url', 'zotero', 'file'] as const;
export const PROMOTE_TYPES = ['theme', 'project', 'task'] as const;

export type ThemeStatus = (typeof THEME_STATUSES)[number];
export type ProjectKind = (typeof PROJECT_KINDS)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type PromoteType = (typeof PROMOTE_TYPES)[number];
export type EntityType = (typeof ENTITY_TYPES)[number];
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];
export type ReviewKind = (typeof REVIEW_KINDS)[number];

export const THEME_STATUS_LABELS: Record<ThemeStatus, string> = {
  active: '进行中',
  dormant: '休眠',
  closed: '已结束',
};

export const PROJECT_KIND_LABELS: Record<ProjectKind, string> = {
  paper: '论文',
  grant: '基金',
  thesis_chapter: '学位论文章节',
  experiment: '实验',
  other: '其他',
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  idea: '构想',
  active: '进行中',
  paused: '暂停',
  submitted: '已投稿',
  done: '已完成',
  dropped: '已放弃',
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: '待办',
  doing: '进行中',
  blocked: '受阻',
  done: '已完成',
};

export const PRIORITY_LABELS: Record<1 | 2 | 3, string> = {
  1: '高',
  2: '中',
  3: '低',
};

/** 已结束的课题状态：不再出现在任务归属的下拉选项里。 */
export const CLOSED_PROJECT_STATUSES: readonly ProjectStatus[] = ['done', 'dropped'];

/** 每天最多几件"最重要的事"。 */
export const MAX_TOP_TASKS = 3;
/** 每周重点最多几条。 */
export const MAX_WEEK_FOCUS = 5;
