import { Link } from '@tanstack/react-router';
import { Hourglass, Pencil, Plus } from 'lucide-react';
import {
  CLOSED_PROJECT_STATUSES,
  PROJECT_KIND_LABELS,
  PROJECT_STATUS_LABELS,
  THEME_STATUS_LABELS,
  type ProjectStatus,
} from '@researchpilot/core/enums';
import { countdownParts } from '@researchpilot/core/countdown';
import type { MilestoneViewDto, ProjectSummaryDto, ThemeMapEntryDto } from '@researchpilot/core/contracts';
import { ProjectDialog } from '@/components/goals/project-dialog';
import { ThemeDialog } from '@/components/goals/theme-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { dueInfo } from '@/lib/format';
import { cn } from '@/lib/utils';

// 议题地图的树状图：议题 → 课题 → 里程碑，从左到右展开（窄屏时从上到下）。
// 每个节点只放最关键的信息；议题的说明、探索任务、文献等放在议题页。
// 连线的样式在 index.css 的 .tree-branch / .tree-item。

/** 每个课题后面最多列几个未完成的里程碑。 */
const MAX_MILESTONES = 4;
/** 探索任务节点里最多列几项。 */
const MAX_EXPLORE = 3;

const isClosedProject = (p: { status: ProjectStatus }) => CLOSED_PROJECT_STATUSES.includes(p.status);

const STATUS_DOT: Record<ProjectStatus, string> = {
  idea: 'bg-muted-foreground/40',
  active: 'bg-success',
  paused: 'bg-amber-500',
  submitted: 'bg-sky-500',
  done: 'bg-muted-foreground/60',
  dropped: 'bg-muted-foreground/30',
};

function percentOf(done: number, total: number) {
  return total ? Math.round((done / total) * 100) : 0;
}

/** 节点里的细进度条。 */
function MiniProgress({ done, total, label }: { done: number; total: number; label: string }) {
  const percent = percentOf(done, total);
  return (
    <div className="mt-2 flex items-center gap-2">
      <div
        className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`${label}进度`}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full rounded-full bg-primary/70" style={{ width: `${percent}%` }} />
      </div>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {total ? `${done}/${total} · ${percent}%` : '暂无任务'}
      </span>
    </div>
  );
}

/** 倒计时的简短说法：'还剩 274 天'，不足一天时 '还剩 5 小时 3 分'。 */
function shortCountdown(at: string): { text: string; expired: boolean } {
  const p = countdownParts(at, Date.now());
  const body = p.days > 0 ? `${p.days} 天` : `${p.hours} 小时 ${p.minutes} 分`;
  return { text: `${p.expired ? '已超过' : '还剩'} ${body}`, expired: p.expired };
}

function ThemeNode({ theme, hiddenProjects }: { theme: ThemeMapEntryDto; hiddenProjects: number }) {
  const inactive = theme.status !== 'active';
  const countdown = theme.countdownAt ? shortCountdown(theme.countdownAt) : null;
  return (
    <div
      className={cn(
        'self-start rounded-xl border-2 border-primary/30 bg-card px-3.5 pt-2.5 pb-3 shadow-xs',
        inactive && 'opacity-75',
      )}
      data-testid="theme-node"
    >
      <div className="flex items-start gap-1">
        <Link
          to="/themes/$themeId"
          params={{ themeId: String(theme.id) }}
          className="min-w-0 flex-1 pt-0.5 leading-snug font-semibold hover:underline"
        >
          {theme.title}
        </Link>
        <ProjectDialog
          themeId={theme.id}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground"
              aria-label={`在"${theme.title}"下新建课题`}
              title="新建课题"
            >
              <Plus />
            </Button>
          }
        />
        <ThemeDialog
          theme={theme}
          trigger={
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground"
              aria-label={`编辑议题：${theme.title}`}
              title="编辑议题"
            >
              <Pencil />
            </Button>
          }
        />
      </div>
      {inactive && (
        <Badge variant="outline" className="mt-1">
          {THEME_STATUS_LABELS[theme.status]}
        </Badge>
      )}
      {countdown && (
        <p
          className={cn(
            'mt-1 flex items-center gap-1 text-xs',
            countdown.expired ? 'text-destructive' : 'text-muted-foreground',
          )}
          data-testid="theme-node-countdown"
        >
          <Hourglass className="size-3" />
          {countdown.text}
        </p>
      )}
      <MiniProgress done={theme.progress.done} total={theme.progress.total} label="议题整体" />
      {hiddenProjects > 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">另有 {hiddenProjects} 个已结束的课题</p>
      )}
    </div>
  );
}

function ProjectNode({ project: p, today }: { project: ProjectSummaryDto; today: string }) {
  const closed = isClosedProject(p);
  const due = p.deadline && !closed ? dueInfo(p.deadline, today) : null;
  return (
    <div
      className={cn('w-full shrink-0 rounded-lg border bg-card px-3 py-2.5 sm:w-64', closed && 'opacity-60')}
      data-testid="project-node"
    >
      <Link
        to="/projects/$projectId"
        params={{ projectId: String(p.id) }}
        className="block text-sm leading-snug font-medium hover:underline"
      >
        {p.title}
      </Link>
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
        <span className={cn('size-1.5 rounded-full', STATUS_DOT[p.status])} />
        {PROJECT_STATUS_LABELS[p.status]}
        <span>·</span>
        {PROJECT_KIND_LABELS[p.kind]}
        {due && (
          <span
            className={cn(
              'ml-auto',
              due.tone === 'overdue' ? 'text-destructive' : due.tone === 'soon' && 'text-foreground',
            )}
          >
            截止 {due.label}
          </span>
        )}
      </p>
      <MiniProgress done={p.progress.done} total={p.progress.total} label={p.title} />
    </div>
  );
}

function MilestoneChips({ milestones, today }: { milestones: MilestoneViewDto[]; today: string }) {
  const open = milestones.filter((m) => !m.doneAt);
  const done = milestones.length - open.length;
  const shown = open.slice(0, MAX_MILESTONES);
  return (
    <ul className="flex flex-wrap gap-1.5 sm:pt-[0.6rem]" aria-label="里程碑">
      {shown.map((m) => {
        const days = m.dueDate ? dueInfo(m.dueDate, today) : null;
        return (
          <li
            key={m.id}
            data-testid="milestone-chip"
            className={cn(
              'rounded-full border bg-card px-2 py-0.5 text-xs whitespace-nowrap',
              days?.tone === 'overdue'
                ? 'border-destructive/40 text-destructive'
                : days?.tone === 'soon'
                  ? 'border-amber-500/50'
                  : '',
            )}
            title={m.dueDate ? `目标日期 ${m.dueDate}` : undefined}
          >
            ◆ {m.title}
            {m.dueDate && (
              <span className="ml-1 text-muted-foreground">{m.dueDate.slice(5).replace('-', '/')}</span>
            )}
          </li>
        );
      })}
      {open.length > shown.length && (
        <li className="px-1 py-0.5 text-xs text-muted-foreground">还有 {open.length - shown.length} 个</li>
      )}
      {done > 0 && (
        <li className="px-1 py-0.5 text-xs text-muted-foreground" title={`已完成 ${done} 个里程碑`}>
          ✓ 已完成 {done}
        </li>
      )}
    </ul>
  );
}

function ProjectBranch({ project, today }: { project: ProjectSummaryDto; today: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-0">
      <ProjectNode project={project} today={today} />
      {project.milestones.length > 0 && (
        <>
          <span
            aria-hidden
            className="mt-[var(--tree-y)] hidden w-4 shrink-0 border-t-[1.5px] border-[color:var(--tree-line)] sm:block"
          />
          <MilestoneChips milestones={project.milestones} today={today} />
        </>
      )}
    </div>
  );
}

/** 直接挂在议题下的探索任务：只列几项，全部在议题页。 */
function ExploreNode({ theme }: { theme: ThemeMapEntryDto }) {
  const tasks = theme.openTasks;
  return (
    <Link
      to="/themes/$themeId"
      params={{ themeId: String(theme.id) }}
      className="block w-full rounded-lg border border-dashed px-3 py-2.5 hover:bg-accent/50 sm:w-64"
      data-testid="explore-node"
    >
      <p className="text-sm leading-snug font-medium">探索任务 · {tasks.length} 项</p>
      <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
        {tasks.slice(0, MAX_EXPLORE).map((t) => (
          <li key={t.id} className="truncate">
            · {t.title}
          </li>
        ))}
        {tasks.length > MAX_EXPLORE && <li>还有 {tasks.length - MAX_EXPLORE} 项</li>}
      </ul>
    </Link>
  );
}

/** 一个议题和它下面的课题、里程碑。 */
export function ThemeBranch({
  theme,
  today,
  showClosed,
}: {
  theme: ThemeMapEntryDto;
  today: string;
  showClosed: boolean;
}) {
  const projects = showClosed ? theme.projects : theme.projects.filter((p) => !isClosedProject(p));
  const empty = projects.length === 0 && theme.openTasks.length === 0;
  return (
    <section
      className="grid md:grid-cols-[15rem_minmax(0,1fr)]"
      data-testid="theme-branch"
      data-theme-id={theme.id}
      aria-label={`议题：${theme.title}`}
    >
      <ThemeNode theme={theme} hiddenProjects={theme.projects.length - projects.length} />
      <ul className="tree-branch">
        {projects.map((p) => (
          <li key={p.id} className="tree-item">
            <ProjectBranch project={p} today={today} />
          </li>
        ))}
        {theme.openTasks.length > 0 && (
          <li className="tree-item">
            <ExploreNode theme={theme} />
          </li>
        )}
        {empty && (
          <li className="tree-item">
            <div className="flex w-full items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground sm:w-64">
              还没有课题
              <ProjectDialog
                themeId={theme.id}
                trigger={
                  <Button variant="ghost" size="sm" className="h-7">
                    <Plus />
                    新建课题
                  </Button>
                }
              />
            </div>
          </li>
        )}
      </ul>
    </section>
  );
}

/** 还没归到任何议题下的课题，挂在一个虚线的"未归属"节点下。 */
export function UnassignedBranch({ projects, today }: { projects: ProjectSummaryDto[]; today: string }) {
  return (
    <section
      className="grid md:grid-cols-[15rem_minmax(0,1fr)]"
      data-testid="unassigned-projects"
      aria-label="未归属议题的课题"
    >
      <div className="self-start rounded-xl border-2 border-dashed px-3.5 py-2.5 text-sm text-muted-foreground">
        <p className="pt-0.5 font-medium">未归属议题</p>
        <p className="mt-1 text-xs">编辑课题，选一个所属议题，它就会挂到那个议题下面。</p>
      </div>
      <ul className="tree-branch">
        {projects.map((p) => (
          <li key={p.id} className="tree-item">
            <ProjectBranch project={p} today={today} />
          </li>
        ))}
      </ul>
    </section>
  );
}
