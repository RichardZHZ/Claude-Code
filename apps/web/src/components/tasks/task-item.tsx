import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { TASK_STATUS_LABELS } from '@researchpilot/core/enums';
import type { TaskViewDto } from '@researchpilot/core/contracts';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { longDate } from '@/lib/format';
import { useTaskActions } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { TaskDialog } from './task-dialog';

export type TaskItemProps = {
  task: TaskViewDto;
  /** 显示所属课题或议题。 */
  showContext?: boolean;
  /** 显示排到的日期或周。 */
  showSchedule?: boolean;
  /** 右侧的操作按钮。 */
  actions?: ReactNode;
  className?: string;
  draggable?: boolean;
};

/** 一条任务：勾选完成、点标题编辑、附带上下文信息和操作按钮。 */
export function TaskItem({
  task,
  showContext = true,
  showSchedule = false,
  actions,
  className,
  draggable,
}: TaskItemProps) {
  const [editing, setEditing] = useState(false);
  const { update } = useTaskActions();
  const done = task.status === 'done';

  return (
    <li
      className={cn(
        'group flex items-start gap-3 rounded-md px-2 py-2 hover:bg-accent/50',
        draggable && 'cursor-grab active:cursor-grabbing',
        className,
      )}
      data-testid="task-item"
      data-task-id={task.id}
      draggable={draggable}
      onDragStart={
        draggable
          ? (e) => {
              e.dataTransfer.setData('text/task-id', String(task.id));
              e.dataTransfer.effectAllowed = 'move';
            }
          : undefined
      }
    >
      <Checkbox
        className="mt-0.5"
        checked={done}
        disabled={update.isPending}
        aria-label={`${done ? '标记为未完成' : '标记为完成'}：${task.title}`}
        onCheckedChange={(checked) =>
          update.mutate({ id: task.id, patch: { status: checked === true ? 'done' : 'todo' } })
        }
      />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          className={cn(
            'text-left text-sm leading-snug hover:underline',
            done && 'text-muted-foreground line-through',
          )}
          onClick={() => setEditing(true)}
        >
          {task.title}
        </button>
        <TaskMeta task={task} showContext={showContext} showSchedule={showSchedule} />
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      {editing && <TaskDialog task={task} open={editing} onOpenChange={setEditing} />}
    </li>
  );
}

function TaskMeta({
  task,
  showContext,
  showSchedule,
}: {
  task: TaskViewDto;
  showContext: boolean;
  showSchedule: boolean;
}) {
  const parts: ReactNode[] = [];
  if (showContext) {
    if (task.projectId && task.projectTitle) {
      parts.push(
        <Link
          key="ctx"
          to="/projects/$projectId"
          params={{ projectId: String(task.projectId) }}
          className="hover:text-foreground hover:underline"
        >
          {task.projectTitle}
        </Link>,
      );
    } else if (task.themeTitle) {
      parts.push(<span key="ctx">议题 · {task.themeTitle}</span>);
    }
  }
  if (task.milestoneTitle) parts.push(<span key="ms">◆ {task.milestoneTitle}</span>);
  if (showSchedule) {
    if (task.scheduledDate) parts.push(<span key="sd">{longDate(task.scheduledDate)}</span>);
    else if (task.weekKey) parts.push(<span key="wk">{task.weekKey}</span>);
  }

  const badges: ReactNode[] = [];
  if (task.priority === 1 && task.status !== 'done') {
    badges.push(
      <Badge key="p" variant="outline" className="border-destructive/40 px-1.5 py-0 text-destructive">
        高
      </Badge>,
    );
  }
  if (task.status === 'doing' || task.status === 'blocked') {
    badges.push(
      <Badge
        key="s"
        variant={task.status === 'blocked' ? 'destructive' : 'secondary'}
        className="px-1.5 py-0"
      >
        {TASK_STATUS_LABELS[task.status]}
      </Badge>,
    );
  }

  if (parts.length === 0 && badges.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {badges}
      {parts}
    </div>
  );
}

/** 任务列表容器。 */
export function TaskList({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn('-mx-2 flex flex-col', className)}>{children}</ul>;
}
