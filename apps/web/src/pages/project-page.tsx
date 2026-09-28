import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ChevronRight, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  PRIORITY_LABELS,
  PROJECT_KIND_LABELS,
  PROJECT_STATUS_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
} from '@researchpilot/core/enums';
import type {
  MilestoneViewDto,
  ProjectDetailDto,
  TaskStatus,
  TaskViewDto,
} from '@researchpilot/core/contracts';
import { isoWeekKey } from '@researchpilot/core/week';
import { EmptyHint, PageHeader, QueryView, Section } from '@/components/common';
import { ProjectDialog } from '@/components/goals/project-dialog';
import { TaskItem, TaskList } from '@/components/tasks/task-item';
import { TaskQuickAdd } from '@/components/tasks/task-quick-add';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { dueInfo, monthDay, relativeTime, todayString } from '@/lib/format';
import { useAction, useActivityFeed, useProject, useTaskActions } from '@/lib/queries';
import { cn } from '@/lib/utils';

export function ProjectPage() {
  const { projectId } = useParams({ from: '/projects/$projectId' });
  const id = Number(projectId);
  if (!Number.isInteger(id) || id <= 0) {
    return <EmptyHint className="py-16 text-center">课题编号不正确。</EmptyHint>;
  }
  return <ProjectLoader id={id} />;
}

function ProjectLoader({ id }: { id: number }) {
  const project = useProject(id);
  return <QueryView query={project}>{(data) => <ProjectContent key={id} project={data} />}</QueryView>;
}

function ProjectContent({ project }: { project: ProjectDetailDto }) {
  const navigate = useNavigate();
  const [today] = useState(todayString);
  const remove = useAction(() => api.delete(`/projects/${project.id}`), { success: '课题已删除' });
  const due = project.deadline ? dueInfo(project.deadline, today) : null;

  function onDelete() {
    if (!window.confirm(`确定删除课题"${project.title}"吗？\n它的里程碑和全部任务都会被删除。`)) return;
    remove.mutate(undefined, { onSuccess: () => void navigate({ to: '/map' }) });
  }

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="位置" className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/map" className="hover:underline">
          议题地图
        </Link>
        {project.theme && (
          <>
            <ChevronRight className="size-3.5" />
            <span>{project.theme.title}</span>
          </>
        )}
      </nav>
      <PageHeader
        title={project.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{PROJECT_KIND_LABELS[project.kind]}</Badge>
            <Badge variant={project.status === 'active' ? 'secondary' : 'outline'}>
              {PROJECT_STATUS_LABELS[project.status]}
            </Badge>
            <span>优先级{PRIORITY_LABELS[project.priority as 1 | 2 | 3]}</span>
            {project.deadline && (
              <span className={cn(due?.tone === 'overdue' && 'text-destructive')}>
                截止 {project.deadline}
                {due && due.tone !== 'normal' ? `（${due.label}）` : ''}
              </span>
            )}
          </span>
        }
        actions={
          <>
            <ProjectDialog
              project={project}
              trigger={
                <Button variant="outline">
                  <Pencil />
                  编辑
                </Button>
              }
            />
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={onDelete}
              disabled={remove.isPending}
            >
              <Trash2 />
              删除
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-3">
        <Progress value={project.progress.percent} label="课题进度" className="h-2" />
        <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
          {project.progress.done}/{project.progress.total} 任务 · {project.progress.percent}%
        </span>
      </div>
      {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}

      <div className="grid gap-6 md:grid-cols-2">
        <CurrentStatusCard project={project} />
        <MilestonesCard project={project} today={today} />
      </div>

      <TaskBoard project={project} today={today} />
      <ActivityCard projectId={project.id} today={today} />
    </div>
  );
}

function CurrentStatusCard({ project }: { project: ProjectDetailDto }) {
  const saved = project.currentStatus ?? '';
  const [text, setText] = useState(saved);
  const save = useAction(() => api.patch(`/projects/${project.id}`, { currentStatus: text }), {
    success: '现状已更新',
  });
  return (
    <Section title="现状" description="我们现在到哪了？下次回来时先看这里。">
      <div className="flex flex-col gap-2">
        <Textarea
          aria-label="课题现状"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="例如：数据已清洗完毕，正在做稳健性检验；卡在工具变量的选择上。"
        />
        <Button
          size="sm"
          className="self-end"
          disabled={text === saved || save.isPending}
          onClick={() => save.mutate()}
        >
          {text === saved ? '已保存' : '保存现状'}
        </Button>
      </div>
    </Section>
  );
}

function MilestonesCard({ project, today }: { project: ProjectDetailDto; today: string }) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const create = useAction(
    () => api.post(`/projects/${project.id}/milestones`, { title, dueDate: dueDate || null }),
    { success: '里程碑已添加' },
  );

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(undefined, {
      onSuccess: () => {
        setTitle('');
        setDueDate('');
      },
    });
  }

  return (
    <Section title="里程碑" description="课题的阶段节点。" testId="milestones">
      <div className="flex flex-col gap-3">
        {project.milestones.length === 0 ? (
          <EmptyHint>还没有里程碑。</EmptyHint>
        ) : (
          <ul className="flex flex-col gap-1">
            {project.milestones.map((m) => (
              <MilestoneRow key={m.id} milestone={m} today={today} />
            ))}
          </ul>
        )}
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <Input
            aria-label="新里程碑名称"
            placeholder="新里程碑，例如：完成初稿"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="sm:flex-1"
          />
          <Input
            aria-label="里程碑目标日期"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="sm:w-40"
          />
          <Button type="submit" variant="secondary" disabled={!title.trim() || create.isPending}>
            <Plus />
            添加
          </Button>
        </form>
      </div>
    </Section>
  );
}

function MilestoneRow({ milestone: m, today }: { milestone: MilestoneViewDto; today: string }) {
  const toggle = useAction((done: boolean) => api.patch(`/milestones/${m.id}`, { done }));
  const remove = useAction(() => api.delete(`/milestones/${m.id}`), { success: '里程碑已删除' });
  const due = m.dueDate && !m.doneAt ? dueInfo(m.dueDate, today) : null;

  return (
    <li className="group flex items-center gap-3 rounded-md px-1 py-1.5 hover:bg-accent/50">
      <Checkbox
        checked={m.doneAt !== null}
        aria-label={`里程碑完成：${m.title}`}
        onCheckedChange={(v) => toggle.mutate(v === true)}
      />
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm', m.doneAt && 'text-muted-foreground line-through')}>{m.title}</p>
        <p className="text-xs text-muted-foreground">
          {m.dueDate ? (
            <span className={cn(due?.tone === 'overdue' && 'text-destructive')}>
              {monthDay(m.dueDate)}
              {due && due.tone !== 'normal' ? ` · ${due.label}` : ''}
            </span>
          ) : (
            '未设日期'
          )}
          {m.progress.total > 0 && ` · 任务 ${m.progress.done}/${m.progress.total}`}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        aria-label={`删除里程碑：${m.title}`}
        onClick={() => {
          if (window.confirm(`删除里程碑"${m.title}"？关联的任务会保留。`)) remove.mutate();
        }}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

const COLUMN_STYLE: Record<TaskStatus, string> = {
  todo: '',
  doing: 'border-t-primary/60',
  blocked: 'border-t-destructive/60',
  done: 'border-t-success/60',
};

/** 任务看板：拖动卡片或用菜单切换状态。 */
function TaskBoard({ project, today }: { project: ProjectDetailDto; today: string }) {
  const { update } = useTaskActions();
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);
  const thisWeek = isoWeekKey(today);

  const moveMenu = (t: TaskViewDto) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7" aria-label={`任务操作：${t.title}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>移到</DropdownMenuLabel>
        {TASK_STATUSES.filter((s) => s !== t.status).map((s) => (
          <DropdownMenuItem key={s} onSelect={() => update.mutate({ id: t.id, patch: { status: s } })}>
            {TASK_STATUS_LABELS[s]}
          </DropdownMenuItem>
        ))}
        {t.status !== 'done' && (
          <>
            <DropdownMenuSeparator />
            {t.weekKey !== thisWeek && (
              <DropdownMenuItem onSelect={() => update.mutate({ id: t.id, patch: { weekKey: thisWeek } })}>
                加入本周
              </DropdownMenuItem>
            )}
            {t.scheduledDate !== today && (
              <DropdownMenuItem onSelect={() => update.mutate({ id: t.id, patch: { scheduledDate: today } })}>
                排到今天
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <Section
      title="任务看板"
      description="拖动卡片可以改变状态，也可以用卡片右侧的菜单。"
      testId="task-board"
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {TASK_STATUSES.map((status) => {
          const items = project.tasks.filter((t) => t.status === status);
          return (
            <div
              key={status}
              data-testid={`column-${status}`}
              className={cn(
                'flex min-h-32 flex-col gap-2 rounded-lg border border-t-4 bg-muted/30 p-3 transition-colors',
                COLUMN_STYLE[status],
                dragOver === status && 'bg-accent',
              )}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes('text/task-id')) return;
                e.preventDefault();
                setDragOver(status);
              }}
              onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(null);
                const taskId = Number(e.dataTransfer.getData('text/task-id'));
                const task = project.tasks.find((t) => t.id === taskId);
                if (task && task.status !== status) update.mutate({ id: taskId, patch: { status } });
              }}
            >
              <h3 className="flex items-center justify-between text-sm font-medium">
                {TASK_STATUS_LABELS[status]}
                <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
              </h3>
              <TaskList className="mx-0 gap-1.5">
                {items.map((t) => (
                  <TaskItem
                    key={t.id}
                    task={t}
                    showContext={false}
                    showSchedule
                    draggable
                    className="bg-card shadow-xs"
                    actions={moveMenu(t)}
                  />
                ))}
              </TaskList>
              {status === 'todo' && (
                <TaskQuickAdd
                  owner={{ projectId: project.id }}
                  placeholder="添加任务…"
                  label="课题的新任务"
                  stacked
                />
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

/** 课题的最近动态：来自活动日志，课题下任务、里程碑的变化都会出现在这里。 */
function ActivityCard({ projectId, today }: { projectId: number; today: string }) {
  const feed = useActivityFeed({ projectId });
  const entries = feed.data?.pages.flat() ?? [];
  return (
    <Section title="最近动态" description="这个课题下发生过的所有变化。" testId="activity-feed">
      {feed.isPending ? (
        <EmptyHint>加载中…</EmptyHint>
      ) : entries.length === 0 ? (
        <EmptyHint>还没有动态。</EmptyHint>
      ) : (
        <div className="flex flex-col gap-2">
          <ol className="flex flex-col border-l pl-4">
            {entries.map((a) => (
              <li key={a.id} className="relative py-1.5 text-sm">
                <span className="absolute top-3 -left-[21px] size-2 rounded-full bg-border" aria-hidden />
                <span>{a.summary}</span>
                <span className="ml-2 text-xs text-muted-foreground">{relativeTime(a.at, today)}</span>
              </li>
            ))}
          </ol>
          {feed.hasNextPage && (
            <Button
              variant="link"
              size="sm"
              className="self-start px-0"
              disabled={feed.isFetchingNextPage}
              onClick={() => void feed.fetchNextPage()}
            >
              {feed.isFetchingNextPage ? '加载中…' : '查看更早的动态'}
            </Button>
          )}
        </div>
      )}
    </Section>
  );
}
