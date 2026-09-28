import { useState, type ReactNode } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { CheckCircle2, ChevronLeft, ChevronRight, Circle, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { FOCUS_MODE_LABELS } from '@researchpilot/core/enums';
import { formatFocusDuration } from '@researchpilot/core/focus';
import { isoWeekKey } from '@researchpilot/core/week';
import type {
  FocusSessionDto,
  RecapDayDto,
  RecapFocusByThemeDto,
  TaskViewDto,
  WeekRecapDto,
} from '@researchpilot/core/contracts';
import { EmptyHint, PageHeader, QueryView, Section } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { longDate, timeOfDay, todayString, weekRangeLabel } from '@/lib/format';
import { useFocusActions, useRecap } from '@/lib/queries';
import { cn } from '@/lib/utils';

const dur = formatFocusDuration;

/**
 * 回顾：按天列出实际做了什么（当天最重要的事、完成的任务、没做完的安排、专注时间）。
 * 不需要另外写复盘，全部来自任务和专注记录。
 */
export function ReviewPage() {
  const { w } = useSearch({ from: '/review' });
  const [today] = useState(todayString);
  const thisWeek = isoWeekKey(today);
  const weekKey = w ?? thisWeek;
  const recap = useRecap(weekKey);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`回顾 · ${weekRangeLabel(weekKey)}`}
        subtitle={weekKey === thisWeek ? `${weekKey} · 本周` : weekKey}
        actions={
          <>
            <Button variant="outline" size="icon" asChild>
              <Link to="/review" search={{ w: recap.data?.prevWeek }} aria-label="上一周">
                <ChevronLeft />
              </Link>
            </Button>
            {weekKey !== thisWeek && (
              <Button variant="outline" asChild>
                <Link to="/review" search={{}}>
                  回到本周
                </Link>
              </Button>
            )}
            <Button variant="outline" size="icon" asChild>
              <Link to="/review" search={{ w: recap.data?.nextWeek }} aria-label="下一周">
                <ChevronRight />
              </Link>
            </Button>
          </>
        }
      />
      <QueryView query={recap}>{(data) => <RecapContent data={data} today={today} />}</QueryView>
    </div>
  );
}

function RecapContent({ data, today }: { data: WeekRecapDto; today: string }) {
  // 新的一天在上面；还没到的日子不显示。
  const days = data.days.filter((d) => d.date <= today).reverse();
  return (
    <div className="flex flex-col gap-6">
      <Section
        title="这一周"
        description={`完成任务 ${data.completedCount} 项 · 专注 ${dur(data.focusMs)}`}
        testId="recap-summary"
      >
        {data.focusByTheme.length === 0 ? (
          <EmptyHint>这一周还没有专注记录。在今日页或桌面小窗的"专心致志"里开始计时。</EmptyHint>
        ) : (
          <FocusBars items={data.focusByTheme} />
        )}
      </Section>

      {days.length === 0 ? (
        <EmptyHint>这一周还没开始。</EmptyHint>
      ) : (
        days.map((d) => <RecapDayCard key={d.date} day={d} today={today} />)
      )}
    </div>
  );
}

/** 各议题专注时长：横条长度按本周最长的议题比例。 */
function FocusBars({ items }: { items: RecapFocusByThemeDto[] }) {
  const max = Math.max(...items.map((i) => i.ms), 1);
  return (
    <ul className="flex flex-col gap-2.5" data-testid="recap-focus-themes">
      {items.map((i) => (
        <li key={i.themeId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <span className="truncate text-sm">{i.title}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {dur(i.ms)} · {i.sessions} 段
          </span>
          <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary/70" style={{ width: `${(i.ms / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function RecapDayCard({ day, today }: { day: RecapDayDto; today: string }) {
  const empty =
    day.topTasks.length === 0 &&
    day.completed.length === 0 &&
    day.unfinished.length === 0 &&
    day.focusSessions.length === 0;
  const summary = [
    day.completed.length > 0 && `完成 ${day.completed.length} 项`,
    day.focusMs > 0 && `专注 ${dur(day.focusMs)}`,
  ].filter(Boolean);

  return (
    <section data-testid="recap-day" data-date={day.date} className="rounded-xl border px-5 py-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold">
          <Link to="/today" search={{ d: day.date }} className="hover:underline">
            {longDate(day.date)}
          </Link>
        </h2>
        {day.date === today && <Badge variant="secondary">今天</Badge>}
        {summary.length > 0 && <span className="text-sm text-muted-foreground">{summary.join(' · ')}</span>}
      </header>

      {empty ? (
        <p className="mt-2 text-sm text-muted-foreground">这天没有记录。</p>
      ) : (
        <div className="mt-3 grid gap-x-8 gap-y-4 md:grid-cols-2">
          {day.topTasks.length > 0 && (
            <Group title="最重要的事">
              {day.topTasks.map((t) => (
                <TaskLine key={t.id} task={t} starred />
              ))}
            </Group>
          )}
          {day.completed.length > 0 && (
            <Group title="完成的任务" testId="recap-completed">
              {day.completed.map((t) => (
                <TaskLine key={t.id} task={t} time={t.doneAt ? timeOfDay(t.doneAt) : undefined} />
              ))}
            </Group>
          )}
          {day.unfinished.length > 0 && (
            <Group title="排在这天、还没做完">
              {day.unfinished.map((t) => (
                <TaskLine key={t.id} task={t} />
              ))}
            </Group>
          )}
          {day.focusSessions.length > 0 && (
            <Group title="专注记录" testId="recap-focus">
              {day.focusSessions.map((s) => (
                <SessionLine key={s.id} session={s} />
              ))}
            </Group>
          )}
        </div>
      )}
    </section>
  );
}

function Group({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId}>
      <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">{title}</h3>
      <ul className="flex flex-col gap-1">{children}</ul>
    </div>
  );
}

function TaskLine({ task, time, starred }: { task: TaskViewDto; time?: string; starred?: boolean }) {
  const done = task.status === 'done';
  const Icon = done ? CheckCircle2 : Circle;
  const context = task.projectTitle ?? task.themeTitle;
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon
        className={cn('mt-0.5 size-4 shrink-0', done ? 'text-success' : 'text-muted-foreground/60')}
        aria-label={done ? '已完成' : '未完成'}
      />
      <span className="min-w-0 flex-1">
        {starred && <Star className="mr-1 inline size-3 -translate-y-px text-amber-500" aria-label="重点" />}
        {task.title}
        {context && <span className="ml-1.5 text-xs text-muted-foreground">{context}</span>}
      </span>
      {time && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{time}</span>}
    </li>
  );
}

function SessionLine({ session: s }: { session: FocusSessionDto }) {
  const { remove } = useFocusActions();
  const running = s.endedAt === null;
  const range = `${timeOfDay(s.startedAt)}–${running ? '进行中' : timeOfDay(s.endedAt!)}`;
  return (
    <li className="group flex items-center gap-2 text-sm" data-testid="recap-focus-session">
      <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">{range}</span>
      <span className="min-w-0 flex-1 truncate">
        {s.themeTitle}
        <span className="ml-1.5 text-xs text-muted-foreground">{FOCUS_MODE_LABELS[s.mode]}</span>
      </span>
      <span className="shrink-0 text-xs tabular-nums">{dur(s.durationMs)}</span>
      {!running && (
        <Button
          variant="ghost"
          size="icon"
          className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          aria-label={`删除专注记录：${s.themeTitle} ${range}`}
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(`删除这段专注记录（${s.themeTitle}，${dur(s.durationMs)}）？`)) {
              remove.mutate(s.id, { onSuccess: () => toast.success('已删除这段专注记录') });
            }
          }}
        >
          <Trash2 />
        </Button>
      )}
    </li>
  );
}
