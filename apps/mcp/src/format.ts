// 把服务层数据整理成给 Claude 阅读的 Markdown。
// 约定：每个对象都带上 #编号，方便 Claude 在写入工具里引用。

import {
  PROJECT_KIND_LABELS,
  PROJECT_STATUS_LABELS,
  TASK_STATUS_LABELS,
  THEME_STATUS_LABELS,
  weekdayOf,
  type ActivityView,
  type DayPlanDraft,
  type DayView,
  type DraftTask,
  type HealthIssue,
  type InboxList,
  type MilestoneDue,
  type ProjectDetail,
  type ResourceView,
  type ReviewEntry,
  type TaskView,
  type ThemeMap,
  type WeekPlanDraft,
  type WeekReviewDraft,
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
  out.push(
    `\n## 周复盘\n${
      w.plan.review
        ? `收获：${w.plan.review.wins.join('；') || '无'}\n阻碍：${w.plan.review.blockers.join('；') || '无'}\n带入下周：${w.plan.review.carryOver.join('；') || '无'}\n反思：${w.plan.review.reflection || '无'}`
        : '（还没写）'
    }`,
  );
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
  out.push(`\n## 工作日志\n${d.plan.journal || '（空）'}`);
  out.push(
    `\n## 晚间复盘\n${
      d.plan.review
        ? `完成：${d.plan.review.done || '无'}\n阻碍：${d.plan.review.blockers || '无'}\n明天先做：${d.plan.review.tomorrow || '无'}`
        : '（还没写）'
    }`,
  );
  return out.join('\n');
}

// ---------- 提醒、复盘、动态、收件箱 ----------

const SEVERITY = { danger: '紧急', warning: '注意', info: '提示' } as const;

export function formatIssues(issues: HealthIssue[]): string {
  if (!issues.length) return '一切正常：没有需要处理的提醒。';
  return issues
    .map((i) => {
      const target =
        i.target.type === 'week'
          ? `周 ${i.target.weekKey}`
          : `${i.target.type === 'project' ? '课题' : '议题'} #${i.target.id}`;
      return `- 【${SEVERITY[i.severity]}】${i.title}（${target}）\n  ${i.detail}`;
    })
    .join('\n');
}

export function formatReviews(list: ReviewEntry[]): string {
  if (!list.length) return '还没有复盘记录。';
  return list
    .map((r) => {
      const head = `## #${r.id} ${r.kind === 'week' ? `周复盘 ${r.periodKey}` : `日复盘 ${mdw(r.periodKey)}`}${r.versions > 1 ? `（修改过 ${r.versions} 次）` : ''}`;
      const c = r.content as Record<string, unknown>;
      const stats = r.stats as Record<string, unknown>;
      const body =
        r.kind === 'week'
          ? [
              `完成 ${String(stats.done)}/${String(stats.total)}`,
              `收获：${(c.wins as string[]).join('；') || '无'}`,
              `阻碍：${(c.blockers as string[]).join('；') || '无'}`,
              `带入下周：${(c.carryOver as string[]).join('；') || '无'}`,
              `反思：${String(c.reflection || '无')}`,
            ]
          : [
              `完成 ${String(stats.done)}/${String(stats.total)}`,
              `完成了：${String(c.done || '无')}`,
              `阻碍：${String(c.blockers || '无')}`,
              `明天先做：${String(c.tomorrow || '无')}`,
            ];
      return `${head}\n${body.join('\n')}`;
    })
    .join('\n\n');
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

export function formatWeekReviewDraft(d: WeekReviewDraft): string {
  return [
    `# ${d.weekKey} 周复盘草稿（${md(d.start)} – ${md(d.end)}）`,
    `完成 ${d.stats.done}/${d.stats.total} 项任务`,
    `\n## 本周重点\n${bullets(d.focus, '（没写）')}`,
    `\n## 建议的收获\n${bullets(d.suggested.wins)}`,
    `\n## 建议的阻碍\n${bullets(d.suggested.blockers)}`,
    `\n## 建议带入下周\n${bullets(d.suggested.carryOver)}`,
    `\n## 本周关联的文献\n${bullets(d.literature)}`,
    d.existingReview
      ? `\n## 已保存的复盘\n收获：${d.existingReview.wins.join('；')}\n反思：${d.existingReview.reflection}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
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
