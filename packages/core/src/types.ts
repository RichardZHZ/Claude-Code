// 服务层返回的"视图"类型。只依赖 schema.ts 的类型，不引入数据库连接，
// 因此前端也可以通过 contracts.ts 安全地引用（经 Wire<> 转成 JSON 形态）。

import type {
  ActivityLogEntry,
  DailyReview,
  InboxItem,
  Milestone,
  Project,
  Review,
  Task,
  Theme,
  WeeklyReview,
} from './schema.ts';
import type { HealthIssue, HealthSeverity } from './rules/health.ts';

export type HealthReport = {
  today: string;
  issues: HealthIssue[];
  counts: Record<HealthSeverity, number>;
};

/** 复盘时间线里的一项：某个周期的最新一版复盘。 */
export type ReviewEntry = Review & { versions: number };

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
    review: WeeklyReview | null;
    reviewedAt: Date | null;
  };
  /** 排在本周的全部任务。 */
  tasks: TaskView[];
  /** 更早的周排了但没做完的任务，可以接到本周。 */
  carryOver: TaskView[];
  /** 还没排进任何一周的未完成任务。 */
  backlog: TaskView[];
  /** 本周结束前到期（含已逾期）且未完成的里程碑。 */
  milestonesDue: MilestoneDue[];
};

export type DayView = {
  date: string;
  weekKey: string;
  prevDate: string;
  nextDate: string;
  plan: {
    topTaskIds: number[];
    journal: string | null;
    review: DailyReview | null;
    reviewedAt: Date | null;
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
