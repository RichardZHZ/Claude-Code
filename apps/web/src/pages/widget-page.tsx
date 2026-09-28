import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { countdownParts } from '@researchpilot/core/countdown';
import { formatFocusDuration } from '@researchpilot/core/focus';
import { isoWeekKey } from '@researchpilot/core/week';
import type { FocusSessionDto, HealthSeverity, TaskViewDto } from '@researchpilot/core/contracts';
import { CountdownDigits } from '@/components/countdown/countdown-card';
import { FocusControls } from '@/components/focus/focus-panel';
import { useFocusController } from '@/components/focus/use-focus-controller';
import { Checkbox } from '@/components/ui/checkbox';
import { deadlineLabel, useNow } from '@/lib/countdown';
import { longDate, todayString } from '@/lib/format';
import { useChecks, useCountdowns, useDay, useTaskActions, useWeek } from '@/lib/queries';
import { readStored, writeStored } from '@/lib/storage';
import { cn } from '@/lib/utils';

/** 小窗最多列几件事。 */
const MAX_ITEMS = 5;
/** 小窗最多显示几个倒计时。 */
const MAX_COUNTDOWNS = 3;
/** 小窗最多列几条提醒。 */
const MAX_ISSUES = 3;
/** 小窗不在前台时也要跟上主窗口里的修改，定时刷新。 */
const REFRESH_MS = 30_000;
/** 专注状态刷新得勤一些：主窗口里开始或结束计时后，小窗很快跟上。 */
const FOCUS_REFRESH_MS = 5_000;
/**
 * 需要提醒时，页面标题带上这个词。桌面应用看到后会把小窗临时提到最上层，
 * 用户点"知道了"或结束计时后恢复原来的层级。
 */
const ATTENTION_TITLE = '科研小助理 · 提醒';
const NORMAL_TITLE = '科研小助理 · 今天';

const SEVERITY_DOT: Record<HealthSeverity, string> = {
  danger: 'bg-destructive',
  warning: 'bg-amber-500',
  info: 'bg-muted-foreground/50',
};

/** 系统通知（桌面应用里直接可用；浏览器里第一次会请求权限）。 */
function notify(title: string, body: string) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') new Notification(title, { body });
  else if (Notification.permission === 'default') void Notification.requestPermission();
}

/**
 * 桌面小窗：从上到下是议题倒计时、专心致志（可以直接开始和结束计时）、提醒条目、
 * 今天最重要的事（可以直接打勾）。桌面应用把它放在一个无边框的小窗口里，贴在桌面上。
 * 在浏览器里打开 /widget 也能看。
 */
export function WidgetPage() {
  const [today, setToday] = useState(todayString);
  const qc = useQueryClient();
  const day = useDay(today);
  const week = useWeek(isoWeekKey(today));
  const checks = useChecks(today);
  const countdowns = useCountdowns().data ?? [];
  const now = useNow();
  const [finished, setFinished] = useState<FocusSessionDto | null>(null);
  const focus = useFocusController(today, {
    refetchInterval: FOCUS_REFRESH_MS,
    onTimerDone: (s) => {
      setFinished(s);
      notify(
        '倒计时结束',
        `${s.themeTitle}：${formatFocusDuration((s.plannedMinutes ?? 0) * 60_000)}，已存档`,
      );
    },
  });

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

  // 正计时每满两小时发一次系统通知（每个门槛只发一次，主窗口和小窗共用记录）。
  const runningId = focus.running?.id;
  const reminders = focus.reminders;
  const elapsed = focus.elapsed;
  const runningTitle = focus.running?.themeTitle;
  useEffect(() => {
    if (runningId === undefined || reminders === 0) return;
    const key = `rp.focus.notified.${runningId}`;
    if (reminders <= readStored(key, 0)) return;
    writeStored(key, reminders);
    notify('专心致志', `"${runningTitle}"已经连续专注 ${formatFocusDuration(elapsed)}，起来活动一下吧。`);
  }, [runningId, reminders, elapsed, runningTitle]);

  const attention = focus.reminderDue || finished !== null;
  useEffect(() => {
    document.title = attention ? ATTENTION_TITLE : NORMAL_TITLE;
  }, [attention]);

  const top = day.data?.topTasks ?? [];
  const scheduled = day.data?.scheduled ?? [];
  const usingTop = top.length > 0;
  const items = (usingTop ? top : scheduled).slice(0, MAX_ITEMS);
  const more = (usingTop ? top : scheduled).length - items.length;
  const carryOver = day.data?.carryOver.filter((t) => t.status !== 'done').length ?? 0;

  const weekTasks = week.data?.tasks ?? [];
  const weekDone = weekTasks.filter((t) => t.status === 'done').length;
  const issues = checks.data?.issues ?? [];

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

      <main className="widget-no-drag min-h-0 flex-1 overflow-y-auto">
        {countdowns.length > 0 && (
          <section
            aria-label="倒计时"
            data-testid="widget-countdowns"
            className="flex flex-col gap-2.5 border-b px-4 pb-3"
          >
            {countdowns.slice(0, MAX_COUNTDOWNS).map((c) => (
              <div key={c.themeId} data-testid="widget-countdown">
                <p className="mb-1 truncate text-xs text-muted-foreground" title={deadlineLabel(c.at)}>
                  {c.title}
                </p>
                <CountdownDigits parts={countdownParts(c.at, now)} />
              </div>
            ))}
            {countdowns.length > MAX_COUNTDOWNS && (
              <p className="text-xs text-muted-foreground">
                还有 {countdowns.length - MAX_COUNTDOWNS} 个倒计时
              </p>
            )}
          </section>
        )}

        <section aria-label="专心致志" data-testid="widget-focus" className="border-b px-4 py-3">
          <h2 className="mb-2 text-xs font-medium text-muted-foreground">专心致志</h2>
          <FocusControls ctl={focus} compact />
          {finished && (
            <div
              role="alert"
              data-testid="focus-finished"
              className="mt-2 flex items-start gap-2 rounded-md border border-success/40 bg-success/10 px-2.5 py-2 text-xs"
            >
              <span className="min-w-0 flex-1">
                倒计时结束：{finished.themeTitle}{' '}
                {formatFocusDuration((finished.plannedMinutes ?? 0) * 60_000)}，已存档。
              </span>
              <button
                type="button"
                className="shrink-0 font-medium underline-offset-2 hover:underline"
                onClick={() => setFinished(null)}
              >
                知道了
              </button>
            </div>
          )}
        </section>

        {issues.length > 0 && (
          <section aria-label="提醒" data-testid="widget-issues" className="border-b px-4 py-3">
            <h2 className="mb-1.5 flex items-baseline justify-between text-xs font-medium text-muted-foreground">
              提醒
              <a
                href="/checks"
                target="_blank"
                rel="noreferrer"
                className="font-normal hover:text-foreground"
              >
                全部 {issues.length} 条
              </a>
            </h2>
            <ul className="flex flex-col gap-1.5">
              {issues.slice(0, MAX_ISSUES).map((i) => (
                <li
                  key={i.key}
                  className="flex items-start gap-2 text-xs leading-snug"
                  data-testid="widget-issue"
                >
                  <span className={cn('mt-1 size-1.5 shrink-0 rounded-full', SEVERITY_DOT[i.severity])} />
                  <span className={cn(i.severity === 'danger' && 'text-destructive')}>{i.title}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="今天的任务" className="px-2 pt-1 pb-2">
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
        </section>
      </main>

      <footer className="widget-drag flex gap-3 border-t px-4 py-2 text-xs text-muted-foreground">
        <span>
          本周 {weekDone}/{weekTasks.length}
        </span>
        {carryOver > 0 && <span>待接手 {carryOver}</span>}
        {focus.todayAllMs > 0 && <span>今日专注 {formatFocusDuration(focus.todayAllMs)}</span>}
      </footer>
    </div>
  );
}

function WidgetTask({ task }: { task: TaskViewDto }) {
  const { update } = useTaskActions();
  const done = task.status === 'done';
  return (
    <li className="flex items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/60">
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
