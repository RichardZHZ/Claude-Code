import { useState, type ReactNode } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { Check, Circle } from 'lucide-react';
import type {
  DailyReview,
  DayReviewStats,
  ReviewEntryDto,
  ReviewKind,
  WeeklyReview,
  WeekReviewStats,
} from '@researchpilot/core/contracts';
import { EmptyHint, PageHeader } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { longDate, relativeTime, todayString, weekRangeLabel } from '@/lib/format';
import { useReviewTimeline } from '@/lib/queries';
import { cn } from '@/lib/utils';

const FILTERS: { kind: ReviewKind | undefined; label: string }[] = [
  { kind: undefined, label: '全部' },
  { kind: 'week', label: '周复盘' },
  { kind: 'day', label: '日复盘' },
];

export function HistoryPage() {
  const { k } = useSearch({ from: '/history' });
  const [today] = useState(todayString);
  const timeline = useReviewTimeline(k);
  const entries = timeline.data?.pages.flat() ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="回顾"
        subtitle="每次保存复盘都会留下一份不可修改的记录，这里是你的研究时间线。"
        actions={
          <div className="flex rounded-md border p-0.5" role="tablist" aria-label="复盘类型">
            {FILTERS.map((f) => (
              <Link
                key={f.label}
                to="/history"
                search={f.kind ? { k: f.kind } : {}}
                role="tab"
                aria-selected={k === f.kind}
                className={cn(
                  'rounded px-3 py-1 text-sm text-muted-foreground',
                  k === f.kind && 'bg-accent font-medium text-foreground',
                )}
              >
                {f.label}
              </Link>
            ))}
          </div>
        }
      />
      {timeline.isPending ? (
        <p className="py-10 text-center text-sm text-muted-foreground">加载中…</p>
      ) : timeline.isError ? (
        <p className="py-10 text-center text-sm text-destructive">加载失败：{timeline.error.message}</p>
      ) : entries.length === 0 ? (
        <EmptyHint className="py-10 text-center">
          还没有复盘记录。在
          <Link to="/today" className="mx-1 underline">
            今日
          </Link>
          写晚间复盘，或在
          <Link to="/week" className="mx-1 underline">
            本周
          </Link>
          写周复盘。
        </EmptyHint>
      ) : (
        <ol className="flex flex-col gap-4" data-testid="review-timeline">
          {entries.map((entry) =>
            entry.kind === 'week' ? (
              <WeekEntry key={entry.id} entry={entry} today={today} />
            ) : (
              <DayEntry key={entry.id} entry={entry} today={today} />
            ),
          )}
        </ol>
      )}
      {timeline.hasNextPage && (
        <Button
          variant="outline"
          className="self-center"
          disabled={timeline.isFetchingNextPage}
          onClick={() => void timeline.fetchNextPage()}
        >
          {timeline.isFetchingNextPage ? '加载中…' : '加载更早的记录'}
        </Button>
      )}
    </div>
  );
}

function SavedMeta({ entry, today }: { entry: ReviewEntryDto; today: string }) {
  return (
    <span className="text-xs font-normal text-muted-foreground">
      {relativeTime(entry.createdAt, today)} 保存
      {entry.versions > 1 && `，共修改 ${entry.versions} 次`}
    </span>
  );
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function Lines({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-0.5 pl-5">
      {items.map((s, i) => (
        <li key={i}>{s}</li>
      ))}
    </ul>
  );
}

function WeekEntry({ entry, today }: { entry: ReviewEntryDto; today: string }) {
  const review = entry.content as WeeklyReview;
  const stats = entry.stats as WeekReviewStats;
  const percent = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;
  return (
    <li data-testid="review-entry" data-kind="week">
      <Card className="gap-4 py-5">
        <CardHeader className="px-5">
          <CardTitle className="flex flex-wrap items-baseline gap-2">
            <Badge variant="secondary">周复盘</Badge>
            <Link to="/week" search={{ w: entry.periodKey }} className="hover:underline">
              {entry.periodKey}
            </Link>
            <span className="text-sm font-normal text-muted-foreground">
              {weekRangeLabel(entry.periodKey)}
            </span>
            <span className="ml-auto">
              <SavedMeta entry={entry} today={today} />
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 px-5">
          <div className="flex items-center gap-3">
            <Progress value={percent} label="本周任务完成度" />
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              完成 {stats.done}/{stats.total}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {stats.focus.length > 0 && (
              <Block label="本周重点">
                <Lines items={stats.focus} />
              </Block>
            )}
            {review.wins.length > 0 && (
              <Block label="收获与进展">
                <Lines items={review.wins} />
              </Block>
            )}
            {review.blockers.length > 0 && (
              <Block label="阻碍">
                <Lines items={review.blockers} />
              </Block>
            )}
            {review.carryOver.length > 0 && (
              <Block label="带入下周">
                <Lines items={review.carryOver} />
              </Block>
            )}
          </div>
          {review.reflection && (
            <Block label="反思">
              <p className="whitespace-pre-wrap">{review.reflection}</p>
            </Block>
          )}
        </CardContent>
      </Card>
    </li>
  );
}

function DayEntry({ entry, today }: { entry: ReviewEntryDto; today: string }) {
  const review = entry.content as DailyReview;
  const stats = entry.stats as DayReviewStats;
  return (
    <li data-testid="review-entry" data-kind="day" className="rounded-lg border px-5 py-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <Link to="/today" search={{ d: entry.periodKey }} className="font-medium hover:underline">
          {longDate(entry.periodKey)}
        </Link>
        <span className="text-xs text-muted-foreground">
          当天任务完成 {stats.done}/{stats.total}
        </span>
        <span className="ml-auto">
          <SavedMeta entry={entry} today={today} />
        </span>
      </div>
      {stats.topTasks.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {stats.topTasks.map((t, i) => (
            <li key={i} className={cn('flex items-center gap-1.5', !t.done && 'text-muted-foreground')}>
              {t.done ? <Check className="size-3.5 text-success" /> : <Circle className="size-3.5" />}
              {t.title}
            </li>
          ))}
        </ul>
      )}
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[6rem_1fr]">
        {review.done && (
          <>
            <dt className="text-muted-foreground">完成了</dt>
            <dd className="whitespace-pre-wrap">{review.done}</dd>
          </>
        )}
        {review.blockers && (
          <>
            <dt className="text-muted-foreground">阻碍</dt>
            <dd className="whitespace-pre-wrap">{review.blockers}</dd>
          </>
        )}
        {review.tomorrow && (
          <>
            <dt className="text-muted-foreground">明天先做</dt>
            <dd className="whitespace-pre-wrap">{review.tomorrow}</dd>
          </>
        )}
      </dl>
    </li>
  );
}
