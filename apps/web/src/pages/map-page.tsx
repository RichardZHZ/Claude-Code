import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Pencil, Plus } from 'lucide-react';
import { PROJECT_KIND_LABELS, PROJECT_STATUS_LABELS, THEME_STATUS_LABELS } from '@researchpilot/core/enums';
import type { ProjectSummaryDto, ThemeMapEntryDto } from '@researchpilot/core/contracts';
import { EmptyHint, PageHeader, QueryView } from '@/components/common';
import { CalendarExport } from '@/components/goals/calendar-export';
import { ProjectDialog } from '@/components/goals/project-dialog';
import { ThemeDialog } from '@/components/goals/theme-dialog';
import { TaskItem, TaskList } from '@/components/tasks/task-item';
import { TaskQuickAdd } from '@/components/tasks/task-quick-add';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { dueInfo, todayString } from '@/lib/format';
import { useThemeMap } from '@/lib/queries';
import { cn } from '@/lib/utils';

export function MapPage() {
  const map = useThemeMap();
  const [today] = useState(todayString);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="议题地图"
        subtitle="研究议题 → 课题 → 里程碑。进度按任务完成情况计算。"
        actions={
          <>
            <CalendarExport />
            <ProjectDialog
              trigger={
                <Button variant="outline">
                  <Plus />
                  新建课题
                </Button>
              }
            />
            <ThemeDialog
              trigger={
                <Button>
                  <Plus />
                  新建议题
                </Button>
              }
            />
          </>
        }
      />
      <QueryView query={map}>
        {(data) =>
          data.themes.length === 0 && data.unassignedProjects.length === 0 ? (
            <Card className="items-center py-12 text-center">
              <CardContent className="flex flex-col items-center gap-3">
                <p className="font-medium">从一个研究议题开始</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  议题是你长期关注的研究方向，例如"气候变化对农业的影响"。之后在议题下建立具体课题，再把课题拆成任务。
                </p>
                <ThemeDialog
                  trigger={
                    <Button>
                      <Plus />
                      新建第一个议题
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-6">
              {data.themes.map((theme) => (
                <ThemeCard key={theme.id} theme={theme} today={today} />
              ))}
              {data.unassignedProjects.length > 0 && (
                <Card className="gap-4 py-5" data-testid="unassigned-projects">
                  <CardHeader className="px-5">
                    <CardTitle className="text-base">未归属议题的课题</CardTitle>
                  </CardHeader>
                  <CardContent className="px-5">
                    <ProjectList projects={data.unassignedProjects} today={today} />
                  </CardContent>
                </Card>
              )}
            </div>
          )
        }
      </QueryView>
    </div>
  );
}

function ThemeCard({ theme, today }: { theme: ThemeMapEntryDto; today: string }) {
  const inactive = theme.status !== 'active';
  return (
    <Card
      className={cn('gap-4 py-5', inactive && 'opacity-75')}
      data-testid="theme-card"
      data-theme-id={theme.id}
    >
      <CardHeader className="px-5">
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          {theme.title}
          {inactive && <Badge variant="outline">{THEME_STATUS_LABELS[theme.status]}</Badge>}
        </CardTitle>
        {theme.description && <CardDescription>{theme.description}</CardDescription>}
        <CardAction className="flex items-center gap-1">
          <ProjectDialog
            themeId={theme.id}
            trigger={
              <Button variant="ghost" size="sm" aria-label={`在"${theme.title}"下新建课题`}>
                <Plus />
                课题
              </Button>
            }
          />
          <ThemeDialog
            theme={theme}
            trigger={
              <Button variant="ghost" size="icon" className="size-8" aria-label={`编辑议题：${theme.title}`}>
                <Pencil />
              </Button>
            }
          />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-5">
        <ProgressLine done={theme.progress.done} total={theme.progress.total} label="议题整体" />
        {theme.coreQuestions.length > 0 && (
          <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
            {theme.coreQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        )}
        {theme.projects.length > 0 ? (
          <ProjectList projects={theme.projects} today={today} />
        ) : (
          <EmptyHint>这个议题下还没有课题。</EmptyHint>
        )}
        <details className="group rounded-md border px-3 py-2" open={theme.openTasks.length > 0}>
          <summary className="cursor-pointer text-sm text-muted-foreground select-none">
            议题下的探索任务（{theme.openTasks.length}）
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {theme.openTasks.length > 0 && (
              <TaskList>
                {theme.openTasks.map((t) => (
                  <TaskItem key={t.id} task={t} showContext={false} showSchedule />
                ))}
              </TaskList>
            )}
            <TaskQuickAdd
              owner={{ themeId: theme.id }}
              placeholder="不属于具体课题的任务，例如读一篇综述…"
              label={`"${theme.title}"下的新任务`}
            />
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

function ProjectList({ projects, today }: { projects: ProjectSummaryDto[]; today: string }) {
  return (
    <ul className="flex flex-col divide-y rounded-md border">
      {projects.map((p) => (
        <ProjectRow key={p.id} project={p} today={today} />
      ))}
    </ul>
  );
}

function ProjectRow({ project: p, today }: { project: ProjectSummaryDto; today: string }) {
  const closed = p.status === 'done' || p.status === 'dropped';
  const due = p.deadline && !closed ? dueInfo(p.deadline, today) : null;
  return (
    <li className={cn('flex flex-col gap-2 px-4 py-3', closed && 'opacity-60')} data-testid="project-row">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to="/projects/$projectId"
          params={{ projectId: String(p.id) }}
          className="font-medium hover:underline"
        >
          {p.title}
        </Link>
        <Badge variant="outline">{PROJECT_KIND_LABELS[p.kind]}</Badge>
        <Badge variant={p.status === 'active' ? 'secondary' : 'outline'}>
          {PROJECT_STATUS_LABELS[p.status]}
        </Badge>
        {due && (
          <span
            className={cn(
              'ml-auto text-xs',
              due.tone === 'overdue'
                ? 'text-destructive'
                : due.tone === 'soon'
                  ? 'text-foreground'
                  : 'text-muted-foreground',
            )}
          >
            截止 {due.label}
          </span>
        )}
      </div>
      <ProgressLine done={p.progress.done} total={p.progress.total} label={p.title} compact />
      {p.milestones.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {p.milestones.map((m) => (
            <li
              key={m.id}
              className={cn(
                'rounded-full border px-2 py-0.5 text-xs',
                m.doneAt
                  ? 'text-muted-foreground line-through'
                  : m.dueDate && m.dueDate < today
                    ? 'border-destructive/40 text-destructive'
                    : 'text-foreground',
              )}
              title={m.dueDate ? `目标日期 ${m.dueDate}` : undefined}
            >
              ◆ {m.title}
              {m.dueDate && !m.doneAt && (
                <span className="ml-1 text-muted-foreground">{m.dueDate.slice(5)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function ProgressLine({
  done,
  total,
  label,
  compact,
}: {
  done: number;
  total: number;
  label: string;
  compact?: boolean;
}) {
  const percent = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <Progress value={percent} label={`${label}进度`} className={compact ? 'h-1' : undefined} />
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {total ? `${done}/${total} · ${percent}%` : '暂无任务'}
      </span>
    </div>
  );
}
