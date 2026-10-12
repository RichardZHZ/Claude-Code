import { Link } from '@tanstack/react-router';
import { AlertOctagon, AlertTriangle, ChevronRight, Info } from 'lucide-react';
import type { HealthIssueDto, HealthSeverity } from '@researchpilot/core/contracts';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { todayString } from '@/lib/format';
import { useTaskActions } from '@/lib/queries';
import { cn } from '@/lib/utils';

const SEVERITY_STYLE: Record<HealthSeverity, { icon: typeof Info; className: string; label: string }> = {
  danger: { icon: AlertOctagon, className: 'text-destructive', label: '紧急' },
  warning: { icon: AlertTriangle, className: 'text-amber-600 dark:text-amber-400', label: '注意' },
  info: { icon: Info, className: 'text-muted-foreground', label: '提示' },
};

/** 提醒指向的页面。 */
function IssueLink({ issue, children }: { issue: HealthIssueDto; children: React.ReactNode }) {
  const className = 'group flex items-start gap-3 rounded-md px-2 py-2.5 hover:bg-accent/50';
  const t = issue.target;
  if (t.type === 'project') {
    return (
      <Link to="/projects/$projectId" params={{ projectId: String(t.id) }} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <Link to="/map" className={className}>
      {children}
    </Link>
  );
}

export function IssueItem({ issue }: { issue: HealthIssueDto }) {
  if (issue.target.type === 'task') return <MissedTaskItem issue={issue} />;
  const style = SEVERITY_STYLE[issue.severity];
  const Icon = style.icon;
  return (
    <li data-testid="health-issue" data-rule={issue.rule} data-severity={issue.severity}>
      <IssueLink issue={issue}>
        <Icon className={cn('mt-0.5 size-4 shrink-0', style.className)} aria-label={style.label} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{issue.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{issue.detail}</p>
        </div>
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
      </IssueLink>
    </li>
  );
}

/** 过期没打勾的任务：直接在提醒里打勾、排到今天或移出计划。 */
function MissedTaskItem({ issue }: { issue: HealthIssueDto }) {
  const { update } = useTaskActions();
  const target = issue.target;
  if (target.type !== 'task') return null;
  const name = target.title;
  return (
    <li
      data-testid="health-issue"
      data-rule={issue.rule}
      data-severity={issue.severity}
      className="flex items-start gap-3 rounded-md px-2 py-2.5 hover:bg-accent/50"
    >
      <Checkbox
        className="mt-0.5"
        disabled={update.isPending}
        aria-label={`标记为完成：${name}`}
        onCheckedChange={(v) => v === true && update.mutate({ id: target.id, patch: { status: 'done' } })}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          <Link to="/today" search={{ d: target.date }} className="hover:underline">
            {issue.title}
          </Link>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{issue.detail}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          disabled={update.isPending}
          aria-label={`排到今天：${name}`}
          onClick={() => update.mutate({ id: target.id, patch: { scheduledDate: todayString() } })}
        >
          排到今天
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={update.isPending}
          aria-label={`移出计划：${name}`}
          onClick={() => update.mutate({ id: target.id, patch: { weekKey: null } })}
        >
          移出计划
        </Button>
      </div>
    </li>
  );
}
