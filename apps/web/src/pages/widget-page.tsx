import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isoWeekKey } from '@researchpilot/core/week';
import type { TaskViewDto } from '@researchpilot/core/contracts';
import { Checkbox } from '@/components/ui/checkbox';
import { longDate, todayString } from '@/lib/format';
import { useChecks, useDay, useTaskActions, useWeek } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** 小窗最多列几件事。 */
const MAX_ITEMS = 5;
/** 小窗不在前台时也要跟上主窗口里的修改，定时刷新。 */
const REFRESH_MS = 30_000;

/**
 * 桌面小窗：今天最重要的事（没有挑的话显示排在今天的任务），可以直接打勾；
 * 底部是本周进度和提醒数量。桌面应用把它放在一个无边框的小窗口里，贴在桌面上。
 * 在浏览器里打开 /widget 也能看。
 */
export function WidgetPage() {
  const [today, setToday] = useState(todayString);
  const qc = useQueryClient();
  const day = useDay(today);
  const week = useWeek(isoWeekKey(today));
  const checks = useChecks(today);

  // 桌面应用的小窗窗口是透明的，页面背景也要透明，只显示卡片。
  useEffect(() => {
    document.documentElement.classList.add('widget');
    return () => document.documentElement.classList.remove('widget');
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setToday(todayString());
      void qc.invalidateQueries();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [qc]);

  const top = day.data?.topTasks ?? [];
  const scheduled = day.data?.scheduled ?? [];
  const usingTop = top.length > 0;
  const items = (usingTop ? top : scheduled).slice(0, MAX_ITEMS);
  const more = (usingTop ? top : scheduled).length - items.length;
  const carryOver = day.data?.carryOver.filter((t) => t.status !== 'done').length ?? 0;

  const weekTasks = week.data?.tasks ?? [];
  const weekDone = weekTasks.filter((t) => t.status === 'done').length;
  const alerts = (checks.data?.counts.danger ?? 0) + (checks.data?.counts.warning ?? 0);
  const urgent = (checks.data?.counts.danger ?? 0) > 0;

  return (
    <div className="flex h-screen flex-col overflow-hidden rounded-2xl border bg-background/95 text-foreground shadow-lg select-none">
      <header className="widget-drag flex items-baseline justify-between gap-2 px-4 pt-3 pb-2">
        <h1 className="text-sm font-semibold">
          今天 <span className="font-normal text-muted-foreground">· {longDate(today)}</span>
        </h1>
        {/* 桌面应用会把同一站点的新窗口链接转成"打开主窗口"。 */}
        <a
          href="/today"
          target="_blank"
          rel="noreferrer"
          className="widget-no-drag text-xs text-muted-foreground hover:text-foreground"
        >
          打开
        </a>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-2">
        {day.isPending ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">正在加载…</p>
        ) : day.isError ? (
          <p className="px-2 py-3 text-xs text-destructive">连不上科研小助理</p>
        ) : items.length === 0 ? (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            今天还没挑最重要的事。
            <a href="/today" target="_blank" rel="noreferrer" className="ml-1 underline">
              去挑选
            </a>
          </p>
        ) : (
          <ul aria-label={usingTop ? '今天最重要的事' : '排在今天的任务'} data-testid="widget-tasks">
            {items.map((t) => (
              <WidgetTask key={t.id} task={t} />
            ))}
            {more > 0 && <li className="px-2 py-1 text-xs text-muted-foreground">还有 {more} 件</li>}
          </ul>
        )}
      </main>

      <footer className="widget-drag flex gap-3 border-t px-4 py-2 text-xs text-muted-foreground">
        <span>
          本周 {weekDone}/{weekTasks.length}
        </span>
        {carryOver > 0 && <span>待接手 {carryOver}</span>}
        {alerts > 0 && <span className={cn(urgent && 'text-destructive')}>提醒 {alerts} 条</span>}
      </footer>
    </div>
  );
}

function WidgetTask({ task }: { task: TaskViewDto }) {
  const { update } = useTaskActions();
  const done = task.status === 'done';
  return (
    <li className="widget-no-drag flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/60">
      <Checkbox
        className="mt-0.5"
        checked={done}
        disabled={update.isPending}
        aria-label={`${done ? '标记为未完成' : '标记为完成'}：${task.title}`}
        onCheckedChange={(v) =>
          update.mutate({ id: task.id, patch: { status: v === true ? 'done' : 'todo' } })
        }
      />
      <span className={cn('text-sm leading-snug', done && 'text-muted-foreground line-through')}>
        {task.title}
      </span>
    </li>
  );
}
