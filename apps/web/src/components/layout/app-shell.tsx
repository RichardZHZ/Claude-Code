import { useState, type FormEvent } from 'react';
import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import {
  Bell,
  CalendarDays,
  CalendarRange,
  DatabaseBackup,
  History,
  Inbox,
  Network,
  Send,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { relativeTime, todayString } from '@/lib/format';
import { useAction, useBackupNow, useBackups, useChecks, useHealth, useInbox } from '@/lib/queries';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/today', label: '今日', icon: CalendarDays },
  { to: '/week', label: '本周', icon: CalendarRange },
  { to: '/map', label: '议题地图', icon: Network },
  { to: '/inbox', label: '收件箱', icon: Inbox },
  { to: '/checks', label: '提醒', icon: Bell },
  { to: '/review', label: '回顾', icon: History },
] as const;

/** 根布局：桌面小窗（/widget）不要侧栏和导航，其余页面都放在应用外框里。 */
export function RootLayout() {
  const isWidget = useRouterState({ select: (s) => s.location.pathname === '/widget' });
  return isWidget ? <Outlet /> : <AppShell />;
}

export function AppShell() {
  const inbox = useInbox();
  const pending = inbox.data?.pending.length ?? 0;
  const [today] = useState(todayString);
  const checks = useChecks(today);
  const alerts = (checks.data?.counts.danger ?? 0) + (checks.data?.counts.warning ?? 0);
  const badges: Partial<
    Record<(typeof NAV)[number]['to'], { count: number; label: string; urgent?: boolean }>
  > = {
    '/inbox': { count: pending, label: `${pending} 条待处理` },
    '/checks': {
      count: alerts,
      label: `${alerts} 条需要注意`,
      urgent: (checks.data?.counts.danger ?? 0) > 0,
    },
  };

  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="border-b bg-muted/30 md:sticky md:top-0 md:flex md:h-screen md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-4 pt-4 md:px-5 md:pt-6">
          <Link to="/today" className="text-lg font-semibold tracking-tight">
            科研小助理
          </Link>
          <HealthDot className="md:hidden" />
        </div>
        <nav aria-label="主导航" className="flex gap-1 overflow-x-auto px-3 py-3 md:flex-col md:px-3 md:py-4">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              activeProps={{ className: 'bg-accent font-medium !text-foreground' }}
            >
              <Icon className="size-4" />
              {label}
              {(badges[to]?.count ?? 0) > 0 && (
                <Badge
                  variant={badges[to]?.urgent ? 'destructive' : 'secondary'}
                  className="ml-auto px-1.5 py-0"
                  aria-label={badges[to]?.label}
                >
                  {badges[to]?.count}
                </Badge>
              )}
            </Link>
          ))}
        </nav>
        <div className="px-4 pb-4 md:px-5">
          <QuickCapture />
        </div>
        <div className="mt-auto hidden space-y-2 px-5 pb-5 md:block">
          <HealthDot showLabel />
          <BackupStatus today={today} />
        </div>
      </aside>
      <main className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">
        <Outlet />
      </main>
    </div>
  );
}

/** 随手记：一键记进收件箱，稍后再整理。 */
function QuickCapture() {
  const [content, setContent] = useState('');
  const add = useAction((text: string) => api.post('/inbox', { content: text }), { success: '已记入收件箱' });

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = content.trim();
    if (!text) return;
    add.mutate(text, { onSuccess: () => setContent('') });
  }

  return (
    <form onSubmit={submit} className="flex gap-1.5">
      <Input
        aria-label="随手记"
        placeholder="随手记一笔…"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="h-8 bg-background text-sm"
      />
      <Button
        type="submit"
        size="icon"
        variant="outline"
        className="size-8"
        disabled={add.isPending}
        aria-label="记下"
      >
        <Send />
      </Button>
    </form>
  );
}

function HealthDot({ showLabel, className }: { showLabel?: boolean; className?: string }) {
  const health = useHealth();
  const ok = health.isSuccess && health.data.ok;
  const label = health.isPending ? '正在连接…' : ok ? '服务与数据库正常' : '未连接到服务';
  return (
    <div className={cn('flex items-center gap-2 text-xs text-muted-foreground', className)} title={label}>
      <span
        className={cn(
          'size-2 rounded-full',
          health.isPending ? 'bg-muted-foreground/40' : ok ? 'bg-success' : 'bg-destructive',
        )}
      />
      {showLabel ? label : <span className="sr-only">{label}</span>}
    </div>
  );
}

/** 最近一次备份的时间和"立即备份"按钮。太久没备份时标红。 */
function BackupStatus({ today }: { today: string }) {
  const backups = useBackups();
  const backupNow = useBackupNow();
  if (!backups.isSuccess) return null;
  const { latest, overdue, dir } = backups.data;
  const label = latest ? `上次备份：${relativeTime(latest.createdAt, today)}` : '还没有备份';
  return (
    <div
      data-testid="backup-status"
      className={cn(
        'flex items-center gap-2 text-xs',
        overdue ? 'text-destructive' : 'text-muted-foreground',
      )}
      title={`备份目录：${dir}`}
    >
      <DatabaseBackup className="size-3.5 shrink-0" />
      <div className="min-w-0">
        <div>{label}</div>
        <button
          type="button"
          className="underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
          disabled={backupNow.isPending}
          onClick={() => backupNow.mutate()}
        >
          {backupNow.isPending ? '正在备份…' : '立即备份'}
        </button>
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="py-16 text-center">
      <p className="text-lg font-medium">页面不存在</p>
      <Link to="/today" className="mt-2 inline-block text-sm underline">
        回到今日
      </Link>
    </div>
  );
}
