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
  'resource',
  'focus_session',
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
  // 旧版本的工作日志和复盘留下的记录，现在不再产生，只为能读懂历史。
  'journaled',
  'reviewed',
  'promoted',
  'linked',
  'unlinked',
  // 专心致志：开始、手动结束（倒计时自然结束记为 completed）。
  'started',
  'stopped',
] as const;
export const RESOURCE_OWNER_TYPES = ['theme', 'project', 'task'] as const;
export const RESOURCE_KINDS = ['url', 'zotero', 'file'] as const;
export const PROMOTE_TYPES = ['theme', 'project', 'task'] as const;
/** 专心致志的两种计时：正计时（手动开始、手动结束）和倒计时（设定时长，到点自动结束）。 */
export const FOCUS_MODES = ['stopwatch', 'timer'] as const;
export const BACKUP_REASONS = ['scheduled', 'manual', 'before-migration', 'before-restore'] as const;

export type ThemeStatus = (typeof THEME_STATUSES)[number];
export type ProjectKind = (typeof PROJECT_KINDS)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type PromoteType = (typeof PROMOTE_TYPES)[number];
export type EntityType = (typeof ENTITY_TYPES)[number];
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];
export type ResourceOwnerType = (typeof RESOURCE_OWNER_TYPES)[number];
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
export type BackupReason = (typeof BACKUP_REASONS)[number];
export type FocusMode = (typeof FOCUS_MODES)[number];

export const FOCUS_MODE_LABELS: Record<FocusMode, string> = {
  stopwatch: '正计时',
  timer: '倒计时',
};

export const BACKUP_REASON_LABELS: Record<BackupReason, string> = {
  scheduled: '自动备份',
  manual: '手动备份',
  'before-migration': '升级前备份',
  'before-restore': '恢复前备份',
};

export const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  url: '链接',
  zotero: '文献',
  file: '文件',
};

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

/** 倒计时专注的常用时长（分钟）。 */
export const FOCUS_TIMER_PRESETS = [25, 45, 60, 90] as const;
/** 倒计时专注最长多少分钟。 */
export const MAX_FOCUS_TIMER_MINUTES = 600;
