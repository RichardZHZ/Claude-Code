// 把服务层数据整理成给 Claude 阅读的 Markdown。
// 约定：每个对象都带上 #编号，方便 Claude 在写入工具里引用。

import {
  FOCUS_MODE_LABELS,
  PROJECT_KIND_LABELS,
  PROJECT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  THEME_STATUS_LABELS,
  describeCountdown,
  focusElapsedMs,
  focusRemainingMs,
  formatFocusDuration,
  weekdayOf,
  type ActivityView,
  type Countdown,
  type DayPlanDraft,
  type DayView,
  type DraftTask,
  type FocusState,
  type RecapFocusByTheme,
  type HealthIssue,
  type InboxList,
  type MilestoneDue,
  type ProjectDetail,
  type ResourceView,
  type TaskView,
  type ThemeMap,
  type WeekPlanDraft,
  type WeekRecap,
  type WeekView,
  type ZoteroItem,
} from '@researchpilot/core';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export function md(date: string): string {
  const [, m, d] = date.split('-');
  return `${Number(m)}月${Number(d)}日`;
}

export function mdw(date: string): string {
  return `${md(date)}（${WEEKDAYS[weekdayOf(date)]}）`;
}

const bullets = (items: string[], empty = '（无）') =>
  items.length ? items.map((s) => `- ${s}`).join('\n') : empty;

// ---------- 任务 ----------

export function taskLine(t: TaskView, opts: { context?: boolean; schedule?: boolean } = {}): string {
  const { context = true, schedule = true } = opts;
  const box = t.status === 'done' ? '[x]' : '[ ]';
  const parts: string[] = [];
  if (context) {
    if (t.projectTitle) parts.push(`课题 #${t.projectId} ${t.projectTitle}`);
    else if (t.themeTitle) parts.push(`议题 #${t.themeId} ${t.themeTitle}`);
  }
  if (t.milestoneTitle) parts.push(`◆ ${t.milestoneTitle}`);
  if (schedule) {
    if (t.scheduledDate) parts.push(mdw(t.scheduledDate));
    else if (t.weekKey) parts.push(t.weekKey);
  }
  if (t.priority === 1 && t.status !== 'done') parts.push('高优先级');
  if (t.status === 'doing' || t.status === 'blocked') parts.push(TASK_STATUS_LABELS[t.status]);
  return `- ${box} #${t.id} ${t.title}${parts.length ? ` · ${parts.join(' · ')}` : ''}`;
}

export const taskLines = (tasks: TaskView[], opts?: Parameters<typeof taskLine>[1], empty = '（无）') =>
  tasks.length ? tasks.map((t) => taskLine(t, opts)).join('\n') : empty;

function draftTaskLines(items: DraftTask[]): string {
  if (!items.length) return '（无）';
  return items
    .map(
      (d) =>
        `${taskLine(d.task)}\n  - 理由：${d.reasons.length ? d.reasons.join('；') : '常规任务'}（分数 ${d.score}）`,
    )
    .join('\n');
}

function milestoneLine(m: MilestoneDue): string {
  return `- ◆ #${m.id} ${m.title}（课题 #${m.projectId} ${m.projectTitle}）${m.dueDate ? ` · ${mdw(m.dueDate)}到期` : ''}`;
}

// ---------- 议题与课题 ----------

export function formatThemeMap(map: ThemeMap): string {
  const out: string[] = ['# 议题地图'];
  if (map.themes.length === 0 && map.unassignedProjects.length === 0) {
    return '# 议题地图\n\n还没有任何议题或课题。';
  }
  for (const th of map.themes) {
    out.push(
      `\n## 议题 #${th.id} ${th.title}（${THEME_STATUS_LABELS[th.status]}）· 任务 ${th.progress.done}/${th.progress.total}`,
    );
    if (th.countdownAt)
      out.push(`倒计时：${dateTime(th.countdownAt)} 截止（${describeCountdown(th.countdownAt)}）`);
    if (th.coreQuestions.length) out.push(`核心问题：${th.coreQuestions.join('；')}`);
    for (const p of th.projects) out.push(projectSummaryLine(p));
    if (th.openTasks.length) out.push(`议题下未完成的任务：\n${taskLines(th.openTasks, { context: false })}`);
  }
  if (map.unassignedProjects.length) {
    out.push('\n## 未归属议题的课题');
    for (const p of map.unassignedProjects) out.push(projectSummaryLine(p));
  }
  return out.join('\n');
}

function projectSummaryLine(p: ThemeMap['themes'][number]['projects'][number]): string {
  const bits = [
    PROJECT_KIND_LABELS[p.kind],
    PROJECT_STATUS_LABELS[p.status],
    `任务 ${p.progress.done}/${p.progress.total}`,
  ];
  if (p.deadline) bits.push(`${md(p.deadline)}截止`);
  const ms = p.milestones
    .map((m) => `${m.doneAt ? '✓' : '◆'} ${m.title}${m.dueDate && !m.doneAt ? `（${md(m.dueDate)}）` : ''}`)
    .join('，');
  return `- 课题 #${p.id} ${p.title}（${bits.join('，')}）${ms ? `\n  里程碑：${ms}` : ''}`;
}

export function formatProject(p: ProjectDetail, resources: ResourceView[], activity: ActivityView[]): string {
  const out = [
    `# 课题 #${p.id} ${p.title}`,
    `- 议题：${p.theme ? `#${p.theme.id} ${p.theme.title}` : '（无）'}`,
    `- 类型：${PROJECT_KIND_LABELS[p.kind]}；状态：${PROJECT_STATUS_LABELS[p.status]}；优先级：${p.priority}`,
    `- 截止：${p.deadline ? md(p.deadline) : '（未设）'}；进度：${p.progress.done}/${p.progress.total}（${p.progress.percent}%）`,
  ];
  if (p.description) out.push(`- 说明：${p.description}`);
  out.push(`\n## 现状\n${p.currentStatus || '（还没写）'}`);
  out.push(
    `\n## 里程碑\n${
      p.milestones.length
        ? p.milestones
            .map(
              (m) =>
                `- ${m.doneAt ? '✓' : '◆'} #${m.id} ${m.title}${m.dueDate ? `（${md(m.dueDate)}）` : ''} · 任务 ${m.progress.done}/${m.progress.total}`,
            )
            .join('\n')
        : '（无）'
    }`,
  );
  out.push(`\n## 任务\n${taskLines(p.tasks, { context: false })}`);
  out.push(`\n## 文献与资源\n${formatResources(resources)}`);
  if (activity.length)
    out.push(
      `\n## 最近动态\n${bullets(activity.map((a) => `${a.summary}（${a.at.toISOString().slice(0, 10)}）`))}`,
    );
  return out.join('\n');
}

export function formatResources(list: ResourceView[]): string {
  return bullets(
    list.map((r) =>
      r.kind === 'zotero'
        ? `#${r.id} 文献 ${r.label ?? r.ref}（Zotero ${r.ref}）`
        : `#${r.id} ${r.kind === 'url' ? '链接' : '文件'} ${r.label ? `${r.label}：` : ''}${r.ref}`,
    ),
  );
}

// ---------- 周与日 ----------

export function formatWeek(w: WeekView): string {
  const done = w.tasks.filter((t) => t.status === 'done').length;
  const out = [
    `# ${w.weekKey}（${md(w.start)} – ${md(w.end)}）`,
    `\n## 本周重点\n${bullets(w.plan.focus, '（还没写）')}`,
    `\n## 本周任务（完成 ${done}/${w.tasks.length}）\n${taskLines(w.tasks)}`,
  ];
  if (w.milestonesDue.length)
    out.push(`\n## 本周到期的里程碑\n${w.milestonesDue.map(milestoneLine).join('\n')}`);
  if (w.carryOver.length) out.push(`\n## 之前几周没做完\n${taskLines(w.carryOver)}`);
  out.push(`\n## 待办池（未排期，前 15 项）\n${taskLines(w.backlog.slice(0, 15))}`);
  if (w.literature.length)
    out.push(`\n## 本周关联的文献\n${bullets(w.literature.map((r) => r.label ?? r.ref))}`);
  return out.join('\n');
}

export function formatDay(d: DayView): string {
  const out = [
    `# ${mdw(d.date)} · ${d.weekKey}`,
    `\n## 最重要的事\n${taskLines(d.topTasks, { schedule: false }, '（还没选）')}`,
    `\n## 当天其他安排\n${taskLines(d.scheduled, { schedule: false })}`,
  ];
  if (d.carryOver.length) out.push(`\n## 待接手（之前排了没做完）\n${taskLines(d.carryOver)}`);
  out.push(`\n## 本周任务池（未定日期）\n${taskLines(d.weekPool)}`);
  return out.join('\n');
}

// ---------- 倒计时、提醒、动态、收件箱 ----------

/** 本机时间的 '2027年6月30日 18:00:00'。 */
export function dateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function remaining(at: Date, now: Date): string {
  return describeCountdown(at, now);
}

export function formatCountdowns(list: Countdown[], now: Date): string {
  if (!list.length) return '还没有设倒计时的议题。';
  return list
    .map((c) => `- 议题 #${c.themeId} ${c.title}：${dateTime(c.at)} 截止，${describeCountdown(c.at, now)}`)
    .join('\n');
}

// ---------- 专心致志与回顾 ----------

const dur = formatFocusDuration;

function focusByTheme(list: RecapFocusByTheme[]): string {
  return list.map((f) => `议题 #${f.themeId} ${f.title} ${dur(f.ms)}`).join('；');
}

export function formatFocusState(s: FocusState, now: Date): string {
  const out: string[] = [];
  if (s.running) {
    const r = s.running;
    const left = focusRemainingMs(r, now);
    const timing =
      left === null
        ? `已进行 ${dur(focusElapsedMs(r, now))}`
        : `设定 ${r.plannedMinutes} 分钟，还剩 ${dur(left)}`;
    out.push(`- 进行中：议题 #${r.themeId} ${r.themeTitle}（${FOCUS_MODE_LABELS[r.mode]}，${timing}）`);
  } else {
    out.push('- 现在没有进行中的专注');
  }
  out.push(`- 今天 ${dur(s.todayMs)}，本周 ${dur(s.weekMs)}（不含进行中的一段）`);
  for (const t of s.themes.filter((t) => t.sessions > 0)) {
    out.push(
      `- 议题 #${t.themeId} ${t.title}：今天 ${dur(t.todayMs)}，本周 ${dur(t.weekMs)}，累计 ${dur(t.totalMs)}（${t.sessions} 段）`,
    );
  }
  return out.join('\n');
}

export function formatRecap(r: WeekRecap): string {
  const out = [
    `# 回顾 ${r.weekKey}（${md(r.start)} – ${md(r.end)}）`,
    `完成任务 ${r.completedCount} 项，专注 ${dur(r.focusMs)}`,
  ];
  if (r.focusByTheme.length) out.push(`按议题：${focusByTheme(r.focusByTheme)}`);
  for (const d of r.days) {
    if (!d.topTasks.length && !d.completed.length && !d.unfinished.length && !d.focusMs) continue;
    out.push(`\n## ${mdw(d.date)}`);
    if (d.topTasks.length)
      out.push(`最重要的事：\n${d.topTasks.map((t) => taskLine(t, { schedule: false })).join('\n')}`);
    if (d.completed.length)
      out.push(`完成：\n${d.completed.map((t) => taskLine(t, { schedule: false })).join('\n')}`);
    if (d.unfinished.length)
      out.push(
        `排在这天、还没做完：\n${d.unfinished.map((t) => taskLine(t, { schedule: false })).join('\n')}`,
      );
    if (d.focusMs) out.push(`专注 ${dur(d.focusMs)}：${focusByTheme(d.focusByTheme)}`);
  }
  if (out.length === (r.focusByTheme.length ? 3 : 2)) out.push('\n这一周还没有记录。');
  return out.join('\n');
}

const SEVERITY = { danger: '紧急', warning: '注意', info: '提示' } as const;

export function formatIssues(issues: HealthIssue[]): string {
  if (!issues.length) return '一切正常：没有需要处理的提醒。';
  return issues
    .map((i) => {
      const target = `${i.target.type === 'project' ? '课题' : '议题'} #${i.target.id}`;
      return `- 【${SEVERITY[i.severity]}】${i.title}（${target}）\n  ${i.detail}`;
    })
    .join('\n');
}

export function formatActivity(list: ActivityView[]): string {
  if (!list.length) return '没有动态。';
  return list
    .map((a) => `- #${a.id} ${a.at.toISOString().replace('T', ' ').slice(0, 16)} ${a.summary}`)
    .join('\n');
}

export function formatInbox(inbox: InboxList): string {
  return `## 待处理（${inbox.pending.length}）\n${bullets(inbox.pending.map((i) => `#${i.id} ${i.content.replace(/\n/g, ' / ')}`))}`;
}

// ---------- 草稿 ----------

export function formatWeekPlanDraft(d: WeekPlanDraft): string {
  return [
    `# ${d.weekKey} 周计划草稿（${md(d.start)} – ${md(d.end)}）`,
    `\n## 已写下的本周重点\n${bullets(d.currentFocus, '（还没写）')}`,
    `\n## 建议的本周重点\n${bullets(d.suggestedFocus)}`,
    `\n## 临近的里程碑（截至下周末）\n${d.milestones.length ? d.milestones.map(milestoneLine).join('\n') : '（无）'}`,
    `\n## 已排进本周的任务\n${taskLines(d.alreadyPlanned)}`,
    `\n## 建议加入本周的任务（按优先程度）\n${draftTaskLines(d.suggestedTasks)}`,
    `\n## 需要注意的提醒\n${formatIssues(d.issues)}`,
  ].join('\n');
}

export function formatDayPlanDraft(d: DayPlanDraft): string {
  return [
    `# ${mdw(d.date)} 日计划草稿`,
    `\n## 建议的最重要的事\n${draftTaskLines(d.suggestedTop)}`,
    `\n## 其他候选\n${draftTaskLines(d.otherCandidates)}`,
    `\n## 当前已选的最重要的事\n${d.currentTopTaskIds.length ? d.currentTopTaskIds.map((id) => `#${id}`).join('、') : '（还没选）'}`,
    `\n## 今天已完成\n${taskLines(d.doneToday, { schedule: false })}`,
  ].join('\n');
}

export function formatZoteroItems(items: ZoteroItem[]): string {
  if (!items.length) return '没有找到匹配的文献。';
  return items
    .map(
      (i) =>
        `- ${i.key} · ${i.creators || '佚名'}${i.year ? ` (${i.year})` : ''} ${i.title}${i.publication ? ` · ${i.publication}` : ''}`,
    )
    .join('\n');
}
