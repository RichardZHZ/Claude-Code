import { useState } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ChevronRight, Pencil, Plus } from 'lucide-react';
import {
  CLOSED_PROJECT_STATUSES,
  PROJECT_KIND_LABELS,
  PROJECT_STATUS_LABELS,
  THEME_STATUS_LABELS,
} from '@researchpilot/core/enums';
import { formatFocusDuration } from '@researchpilot/core/focus';
import type { ProjectSummaryDto, ThemeMapEntryDto } from '@researchpilot/core/contracts';
import { EmptyHint, PageHeader, QueryView, Section } from '@/components/common';
import { ThemeCountdown } from '@/components/countdown/countdown-card';
import { ProjectDialog } from '@/components/goals/project-dialog';
import { ThemeDialog } from '@/components/goals/theme-dialog';
import { ResourcesPanel } from '@/components/resources/resources-panel';
import { TaskItem, TaskList } from '@/components/tasks/task-item';
import { TaskQuickAdd } from '@/components/tasks/task-quick-add';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { dueInfo, todayString } from '@/lib/format';
import { useFocus, useThemeMap } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** 议题页：议题的说明、核心问题、全部课题、探索任务、文献，以及倒计时和专注时间。 */
export function ThemePage() {
  const { themeId } = useParams({ from: '/themes/$themeId' });
  const map = useThemeMap();
  return (
    <QueryView query={map}>
      {(data) => {
        const theme = data.themes.find((t) => t.id === Number(themeId));
        if (!theme) {
          return (
            <div className="py-16 text-center">
              <p className="text-lg font-medium">议题不存在</p>
              <Link to="/map" className="mt-2 inline-block text-sm underline">
                回到议题地图
              </Link>
            </div>
          );
        }
        return <ThemeContent theme={theme} />;
      }}
    </QueryView>
  );
}

function ThemeContent({ theme }: { theme: ThemeMapEntryDto }) {
  const navigate = useNavigate();
  const [today] = useState(todayString);
  const focus = useFocus(today).data?.themes.find((t) => t.themeId === theme.id);

  return (
    <div className="flex flex-col gap-6" data-testid="theme-page">
      <nav aria-label="位置" className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/map" className="hover:underline">
          议题地图
        </Link>
        <ChevronRight className="size-3.5" />
        <span>{theme.title}</span>
      </nav>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {theme.title}
            {theme.status !== 'active' && (
              <Badge variant="outline">{THEME_STATUS_LABELS[theme.status]}</Badge>
            )}
          </span>
        }
        subtitle={theme.description ?? undefined}
        actions={
          <>
            <ProjectDialog
              themeId={theme.id}
              trigger={
                <Button variant="outline">
                  <Plus />
                  新建课题
                </Button>
              }
            />
            <ThemeDialog
              theme={theme}
              onDeleted={() => void navigate({ to: '/map' })}
              trigger={
                <Button variant="outline" aria-label={`编辑议题：${theme.title}`}>
                  <Pencil />
                  编辑
                </Button>
              }
            />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6">
          <Section title={`课题（${theme.projects.length}）`} testId="theme-projects">
            {theme.projects.length > 0 ? (
              <ul className="flex flex-col divide-y rounded-md border">
                {theme.projects.map((p) => (
                  <ProjectRow key={p.id} project={p} today={today} />
                ))}
              </ul>
            ) : (
              <EmptyHint>这个议题下还没有课题。</EmptyHint>
            )}
          </Section>

          <Section
            title={`探索任务（${theme.openTasks.length}）`}
            description="不属于具体课题的任务，例如读一篇综述。"
            testId="theme-tasks"
          >
            <div className="flex flex-col gap-3">
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
          </Section>

          <Section title="文献与资源" testId="theme-resources">
            <ResourcesPanel ownerType="theme" ownerId={theme.id} ownerTitle={theme.title} />
          </Section>
        </div>

        <div className="flex flex-col gap-6">
          {theme.countdownAt && (
            <Section title="倒计时">
              <ThemeCountdown at={theme.countdownAt} />
            </Section>
          )}
          <Section title="概况">
            <div className="flex flex-col gap-3 text-sm">
              <ProgressLine done={theme.progress.done} total={theme.progress.total} label="议题整体" />
              {focus && (
                <p className="text-muted-foreground" data-testid="theme-focus">
                  专注：今天 {formatFocusDuration(focus.todayMs)} · 本周 {formatFocusDuration(focus.weekMs)} ·
                  累计 {formatFocusDuration(focus.totalMs)}
                </p>
              )}
              {theme.coreQuestions.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">核心问题</p>
                  <ul className="list-disc space-y-0.5 pl-5" data-testid="theme-questions">
                    {theme.coreQuestions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function ProjectRow({ project: p, today }: { project: ProjectSummaryDto; today: string }) {
  const closed = CLOSED_PROJECT_STATUSES.includes(p.status);
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
      {p.currentStatus && <p className="text-xs text-muted-foreground">现状：{p.currentStatus}</p>}
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
