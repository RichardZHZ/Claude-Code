// 服务层返回的"视图"类型。只依赖 schema.ts 的类型，不引入数据库连接，
// 因此前端也可以通过 contracts.ts 安全地引用（经 Wire<> 转成 JSON 形态）。

import type {
  ActivityLogEntry,
  FocusSession,
  InboxItem,
  Milestone,
  Project,
  Resource,
  Task,
  Theme,
} from './schema.ts';
import type { BackupReason } from './enums.ts';
import type { HealthIssue, HealthSeverity } from './rules/health.ts';

export type HealthReport = {
  today: string;
  issues: HealthIssue[];
  counts: Record<HealthSeverity, number>;
};

/** 资源附带所属对象的标题（对象已删除时为 null）。 */
export type ResourceView = Resource & { ownerTitle: string | null };

/** 活动记录附带一句中文说明。 */
export type ActivityView = ActivityLogEntry & { summary: string };

export type Progress = {
  done: number;
  total: number;
  /** 0–100 的整数。没有任务时为 0。 */
  percent: number;
};

/** 任务及其所属上下文，用于在列表里显示"属于哪个课题/议题"。 */
export type TaskView = Task & {
  projectTitle: string | null;
  milestoneTitle: string | null;
  /** 任务实际所属的议题：直接挂在议题下的取 theme_id，挂在课题下的取课题的议题。 */
  ownerThemeId: number | null;
  themeTitle: string | null;
};

export type MilestoneView = Milestone & { progress: Progress };

export type ProjectSummary = Project & {
  progress: Progress;
  milestones: MilestoneView[];
  openTaskCount: number;
};

export type ThemeMapEntry = Theme & {
  /** 该议题下所有任务（含各课题的任务）的完成情况。 */
  progress: Progress;
  projects: ProjectSummary[];
  /** 直接挂在议题下、尚未完成的任务。 */
  openTasks: TaskView[];
};

export type ThemeMap = {
  themes: ThemeMapEntry[];
  unassignedProjects: ProjectSummary[];
};

export type ProjectDetail = Project & {
  theme: { id: number; title: string } | null;
  progress: Progress;
  milestones: MilestoneView[];
  tasks: TaskView[];
};

export type MilestoneDue = Milestone & { projectTitle: string };

export type WeekView = {
  weekKey: string;
  start: string;
  end: string;
  prevWeek: string;
  nextWeek: string;
  plan: {
    focus: string[];
  };
  /** 排在本周的全部任务。 */
  tasks: TaskView[];
  /** 更早的周排了但没做完的任务，可以接到本周。 */
  carryOver: TaskView[];
  /** 还没排进任何一周的未完成任务。 */
  backlog: TaskView[];
  /** 本周结束前到期（含已逾期）且未完成的里程碑。 */
  milestonesDue: MilestoneDue[];
  /** 本周新关联的 Zotero 文献。 */
  literature: ResourceView[];
};

export type DayView = {
  date: string;
  weekKey: string;
  prevDate: string;
  nextDate: string;
  plan: {
    topTaskIds: number[];
  };
  /** 当天最重要的事，按设定顺序。 */
  topTasks: TaskView[];
  /** 排在当天、但不在"最重要"里的任务。 */
  scheduled: TaskView[];
  /** 更早的日子排了但没做完的任务。 */
  carryOver: TaskView[];
  /** 本周还没排到某一天的未完成任务。 */
  weekPool: TaskView[];
};

export type OwnerOptions = {
  themes: { id: number; title: string }[];
  projects: { id: number; title: string; themeId: number | null }[];
};

export type InboxList = {
  pending: InboxItem[];
  processed: InboxItem[];
};

export type PromoteResult = {
  item: InboxItem;
  created: { type: 'theme' | 'project' | 'task'; id: number };
};

// ---------- 草稿 ----------

/** 草稿里建议的任务：附带排序分数和理由。 */
export type DraftTask = { task: TaskView; score: number; reasons: string[] };

export type WeekPlanDraft = {
  weekKey: string;
  start: string;
  end: string;
  /** 已经写下的本周重点。 */
  currentFocus: string[];
  /** 按规则建议的本周重点（上周带入、临近的里程碑、临近截止的课题）。 */
  suggestedFocus: string[];
  /** 已经排进本周的任务。 */
  alreadyPlanned: TaskView[];
  /** 建议加入本周的任务，按分数从高到低。 */
  suggestedTasks: DraftTask[];
  /** 截至下周末到期、尚未完成的里程碑。 */
  milestones: MilestoneDue[];
  /** 需要注意的健康检查提醒。 */
  issues: HealthIssue[];
};

export type DayPlanDraft = {
  date: string;
  weekKey: string;
  currentTopTaskIds: number[];
  /** 建议的最重要的事（最多 3 件，不含受阻任务）。 */
  suggestedTop: DraftTask[];
  otherCandidates: DraftTask[];
  doneToday: TaskView[];
};

export type BackupInfo = {
  file: string;
  path: string;
  createdAt: Date;
  /** 字节数。 */
  size: number;
  reason: BackupReason;
};

export type BackupStatus = {
  /** 备份目录。 */
  dir: string;
  /** 是否在应用运行时自动备份。 */
  auto: boolean;
  intervalHours: number;
  keep: number;
  /** 最近一次备份（没有则为 null）。 */
  latest: BackupInfo | null;
  /** 距最近一次备份超过两个间隔（或从未备份且自动备份关闭）时为 true。 */
  overdue: boolean;
  items: BackupInfo[];
};

/** 议题倒计时：截止时刻由用户设定，剩余时间由前端按秒计算。 */
export type Countdown = {
  themeId: number;
  title: string;
  status: Theme['status'];
  /** 截止时刻。 */
  at: Date;
};

// ---------- 专心致志 ----------

/** 一段专注，附带议题标题和时长（进行中的按服务端当前时刻计算，前端再按秒更新）。 */
export type FocusSessionView = FocusSession & {
  themeTitle: string;
  durationMs: number;
};

/** 某个议题的专注时间合计（只算已经结束的段落）。 */
export type FocusThemeTotal = {
  themeId: number;
  title: string;
  status: Theme['status'];
  todayMs: number;
  weekMs: number;
  totalMs: number;
  /** 已结束的段数。 */
  sessions: number;
};

export type FocusState = {
  today: string;
  weekKey: string;
  /** 正在进行的一段；没有则为 null。 */
  running: FocusSessionView | null;
  /** 今天、本周已结束的专注合计（不含进行中的一段）。 */
  todayMs: number;
  weekMs: number;
  /** 所有未结束议题的合计，另加结束了但有专注记录的议题。 */
  themes: FocusThemeTotal[];
  /** 今天开始的各段，新的在前。 */
  todaySessions: FocusSessionView[];
};

// ---------- 回顾 ----------

export type RecapFocusByTheme = { themeId: number; title: string; ms: number; sessions: number };

/** 某一天做了什么：完成的任务、当天最重要的事、排在当天没做完的任务、专注时间。 */
export type RecapDay = {
  date: string;
  /** 当天最重要的事（按设定顺序，含当前状态）。 */
  topTasks: TaskView[];
  /** 当天完成的任务（按完成时刻）。 */
  completed: TaskView[];
  /** 排在当天、至今没完成的任务。 */
  unfinished: TaskView[];
  focusMs: number;
  focusByTheme: RecapFocusByTheme[];
  focusSessions: FocusSessionView[];
};

export type WeekRecap = {
  weekKey: string;
  start: string;
  end: string;
  prevWeek: string;
  nextWeek: string;
  /** 周一到周日。 */
  days: RecapDay[];
  completedCount: number;
  focusMs: number;
  focusByTheme: RecapFocusByTheme[];
};
