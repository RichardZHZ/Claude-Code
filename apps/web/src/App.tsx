import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, CalendarRange, Inbox, Network, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiGet, type Health } from '@/lib/api';

type HealthState =
  { status: 'loading' } | { status: 'ok'; data: Health } | { status: 'error'; message: string };

function useHealth() {
  const [state, setState] = useState<HealthState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    apiGet<Health>('/health', controller.signal)
      .then((data) => setState({ status: 'ok', data }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}

const SECTIONS = [
  { icon: CalendarDays, title: '今日', description: '当天 Top 3 任务、工作日志和晚间复盘。' },
  { icon: CalendarRange, title: '本周', description: '本周重点、按课题分组的任务看板和周末复盘。' },
  { icon: Network, title: '议题地图', description: '研究议题、课题、里程碑的层级与进度。' },
  { icon: Inbox, title: '收件箱', description: '随手记下的想法，之后升级为任务或课题。' },
];

export function App() {
  const { state, retry } = useHealth();

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">科研小助理</h1>
          <p className="text-sm text-muted-foreground">
            {state.status === 'ok' ? `${state.data.today} · ${state.data.week}` : '长期目标与短期计划'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {state.status === 'loading' && <Badge variant="outline">正在连接…</Badge>}
          {state.status === 'ok' && (
            <Badge variant={state.data.ok ? 'success' : 'destructive'}>
              {state.data.ok ? '服务与数据库正常' : '数据库不可用'}
            </Badge>
          )}
          {state.status === 'error' && (
            <>
              <Badge variant="destructive" title={state.message}>
                未连接到服务
              </Badge>
              <Button variant="outline" size="sm" onClick={retry}>
                <RefreshCw />
                重试
              </Button>
            </>
          )}
        </div>
      </header>

      {state.status === 'error' && (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          前端没能连上后端服务：{state.message}。请确认已在仓库根目录运行 <code>pnpm dev</code>。
        </p>
      )}

      <section className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map(({ icon: Icon, title, description }) => (
          <Card key={title} className="gap-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="size-4 text-muted-foreground" />
                {title}
              </CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      <footer className="mt-auto text-xs text-muted-foreground">
        项目骨架已就绪。上面四个页面将在第一阶段实现。
      </footer>
    </div>
  );
}
