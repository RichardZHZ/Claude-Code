// 健康检查规则：纯函数，输入一份数据快照，输出提醒列表。
// 所有判断都是确定性的，阈值集中在 HEALTH_THRESHOLDS 里。

import type { ProjectStatus, TaskStatus, ThemeStatus } from '../enums.ts';
import { daysBetween } from '../week.ts';

export const HEALTH_THRESHOLDS = {
  /** 进行中的课题超过这么多天没有任何活动，视为停滞。 */
  staleDays: 14,
  /** 里程碑在这么多天内到期时开始检查进度。 */
  milestoneWindowDays: 7,
  /** 临近到期的里程碑，关联任务完成率低于这个百分比视为有风险。 */
  milestoneMinPercent: 50,
  /** 议题建立后这么多天内不提醒"没有进行中的课题"。 */
  themeGraceDays: 7,
} as const;

export const HEALTH_RULES = [
  'milestone_at_risk',
  'stale_project',
  'orphaned_tasks',
  'dormant_theme',
  'missed_task',
] as const;
export type HealthRule = (typeof HEALTH_RULES)[number];
export type HealthSeverity = 'danger' | 'warning' | 'info';

export const HEALTH_RULE_LABELS: Record<HealthRule, string> = {
  milestone_at_risk: '里程碑有风险',
  stale_project: '课题停滞',
  orphaned_tasks: '遗留任务',
  dormant_theme: '议题缺少课题',
  missed_task: '过期未完成的任务',
};

export type HealthTarget =
  | { type: 'project'; id: number }
  | { type: 'theme'; id: number }
  /** 任务：date 是它原来排在的那一天。 */
  | { type: 'task'; id: number; date: string; title: string };

export type HealthIssue = {
  /** 稳定的标识，例如 'stale_project:3'。 */
  key: string;
  rule: HealthRule;
  severity: HealthSeverity;
  title: string;
  detail: string;
  target: HealthTarget;
};

export type HealthSnapshot = {
  today: string;
  themes: { id: number; title: string; status: ThemeStatus; createdOn: string }[];
  projects: {
    id: number;
    title: string;
    status: ProjectStatus;
    themeId: number | null;
    /** 最近一次活动的日期（课题本身、它的任务或里程碑）。 */
    lastActiveOn: string;
  }[];
  milestones: {
    id: number;
    title: string;
    projectId: number;
    dueDate: string | null;
    done: boolean;
    taskDone: number;
    taskTotal: number;
  }[];
  /** 未完成的任务。 */
  openTasks: {
    id: number;
    title: string;
    projectId: number | null;
    themeId: number | null;
    status: TaskStatus;
    /** 排在哪一天（没排到具体日子为空）。 */
    scheduledDate: string | null;
  }[];
};

const SEVERITY_ORDER: Record<HealthSeverity, number> = { danger: 0, warning: 1, info: 2 };

function monthDay(date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

export function evaluateHealth(s: HealthSnapshot): HealthIssue[] {
  const T = HEALTH_THRESHOLDS;
  const issues: HealthIssue[] = [];
  const projectById = new Map(s.projects.map((p) => [p.id, p]));

  // 1. 里程碑有风险：已逾期，或临近到期但关联任务完成不到一半。
  for (const m of s.milestones) {
    if (m.done || !m.dueDate) continue;
    const project = projectById.get(m.projectId);
    if (!project || project.status !== 'active') continue;
    const days = daysBetween(s.today, m.dueDate);
    if (days > T.milestoneWindowDays) continue;
    const percent = m.taskTotal === 0 ? 0 : Math.round((m.taskDone / m.taskTotal) * 100);
    const overdue = days < 0;
    if (!overdue && percent >= T.milestoneMinPercent) continue;
    const when = overdue ? `已逾期 ${-days} 天` : days === 0 ? '今天到期' : `还剩 ${days} 天`;
    const progress =
      m.taskTotal === 0 ? '还没有关联任务' : `关联任务完成 ${m.taskDone}/${m.taskTotal}（${percent}%）`;
    issues.push({
      key: `milestone_at_risk:${m.id}`,
      rule: 'milestone_at_risk',
      severity: overdue ? 'danger' : 'warning',
      title: `里程碑"${m.title}"${when}`,
      detail: `课题"${project.title}"，${progress}。${overdue ? '完成了就去打勾，没完成就调整日期。' : ''}`,
      target: { type: 'project', id: project.id },
    });
  }

  // 2. 课题停滞：进行中的课题太久没有任何活动。
  for (const p of s.projects) {
    if (p.status !== 'active') continue;
    const idle = daysBetween(p.lastActiveOn, s.today);
    if (idle <= T.staleDays) continue;
    issues.push({
      key: `stale_project:${p.id}`,
      rule: 'stale_project',
      severity: 'warning',
      title: `课题"${p.title}"已经 ${idle} 天没有进展`,
      detail: `最后一次更新在${monthDay(p.lastActiveOn)}。继续推进，或者把它设为"暂停"。`,
      target: { type: 'project', id: p.id },
    });
  }

  // 3. 遗留任务：课题或议题已经结束，下面还有没完成的任务。
  const leftoverByProject = new Map<number, number>();
  const leftoverByTheme = new Map<number, number>();
  for (const t of s.openTasks) {
    if (t.projectId !== null)
      leftoverByProject.set(t.projectId, (leftoverByProject.get(t.projectId) ?? 0) + 1);
    else if (t.themeId !== null) leftoverByTheme.set(t.themeId, (leftoverByTheme.get(t.themeId) ?? 0) + 1);
  }
  for (const p of s.projects) {
    const n = leftoverByProject.get(p.id) ?? 0;
    if (n === 0 || (p.status !== 'done' && p.status !== 'dropped')) continue;
    issues.push({
      key: `orphaned_tasks:project:${p.id}`,
      rule: 'orphaned_tasks',
      severity: 'info',
      title: `课题"${p.title}"已${p.status === 'done' ? '完成' : '放弃'}，还有 ${n} 项任务没做完`,
      detail: '把它们标记完成、删除，或者移到别的课题。',
      target: { type: 'project', id: p.id },
    });
  }
  for (const th of s.themes) {
    const n = leftoverByTheme.get(th.id) ?? 0;
    if (n === 0 || th.status !== 'closed') continue;
    issues.push({
      key: `orphaned_tasks:theme:${th.id}`,
      rule: 'orphaned_tasks',
      severity: 'info',
      title: `议题"${th.title}"已结束，还有 ${n} 项任务没做完`,
      detail: '把它们标记完成、删除，或者移到别的议题。',
      target: { type: 'theme', id: th.id },
    });
  }

  // 4. 议题缺少课题：进行中的议题下没有进行中的课题。
  for (const th of s.themes) {
    if (th.status !== 'active') continue;
    if (daysBetween(th.createdOn, s.today) < T.themeGraceDays) continue;
    if (s.projects.some((p) => p.themeId === th.id && p.status === 'active')) continue;
    issues.push({
      key: `dormant_theme:${th.id}`,
      rule: 'dormant_theme',
      severity: 'info',
      title: `议题"${th.title}"下没有进行中的课题`,
      detail: '新建一个课题推进它，或者把议题设为"休眠"。',
      target: { type: 'theme', id: th.id },
    });
  }

  // 5. 过期未完成的任务：排在今天之前的某一天，到现在还没打勾（可能做完了忘了勾）。
  //    课题或议题已经结束的，交给"遗留任务"汇总，这里不重复。
  const themeById = new Map(s.themes.map((th) => [th.id, th]));
  const missed = s.openTasks
    .filter((t) => t.scheduledDate !== null && t.scheduledDate < s.today)
    .filter((t) => {
      if (t.projectId !== null) {
        const p = projectById.get(t.projectId);
        return !p || (p.status !== 'done' && p.status !== 'dropped');
      }
      return t.themeId === null || themeById.get(t.themeId)?.status !== 'closed';
    })
    .sort((a, b) => a.scheduledDate!.localeCompare(b.scheduledDate!) || a.id - b.id);
  for (const t of missed) {
    const date = t.scheduledDate!;
    const ago = daysBetween(date, s.today);
    issues.push({
      key: `missed_task:${t.id}`,
      rule: 'missed_task',
      severity: 'warning',
      title: `任务"${t.title}"排在${monthDay(date)}，还没完成`,
      detail: `${ago === 1 ? '昨天' : `${ago} 天前`}的安排${t.status === 'blocked' ? '（受阻）' : ''}。做完了就打勾；还要做就排到今天，不做了就移出计划。`,
      target: { type: 'task', id: t.id, date, title: t.title },
    });
  }

  return issues
    .map((issue, i) => ({ issue, i }))
    .sort((a, b) => SEVERITY_ORDER[a.issue.severity] - SEVERITY_ORDER[b.issue.severity] || a.i - b.i)
    .map(({ issue }) => issue);
}
