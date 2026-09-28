import { Link } from '@tanstack/react-router';
import { Hourglass } from 'lucide-react';
import { countdownParts, type CountdownParts } from '@researchpilot/core/countdown';
import type { CountdownDto } from '@researchpilot/core/contracts';
import { EmptyHint, Section } from '@/components/common';
import { deadlineLabel, useNow } from '@/lib/countdown';
import { useCountdowns } from '@/lib/queries';
import { cn } from '@/lib/utils';

const pad = (n: number) => String(n).padStart(2, '0');

/** 天、时、分、秒四格；过期后显示已超过多久（红色）。 */
export function CountdownDigits({
  parts,
  size = 'md',
}: {
  parts: CountdownParts;
  size?: 'sm' | 'md' | 'lg';
}) {
  const cells: [number | string, string][] = [
    [parts.days, '天'],
    [pad(parts.hours), '时'],
    [pad(parts.minutes), '分'],
    [pad(parts.seconds), '秒'],
  ];
  const number = { sm: 'text-base', md: 'text-2xl', lg: 'text-3xl' }[size];
  return (
    <div
      className={cn('flex items-baseline gap-1.5 tabular-nums', parts.expired && 'text-destructive')}
      role="timer"
      aria-label={`${parts.expired ? '已超过' : '还剩'} ${parts.days} 天 ${parts.hours} 小时 ${parts.minutes} 分 ${parts.seconds} 秒`}
    >
      {parts.expired && <span className="mr-0.5 text-xs">已超过</span>}
      {cells.map(([value, unit]) => (
        <span key={unit} className="flex items-baseline gap-0.5">
          <span className={cn('leading-none font-semibold', number)}>{value}</span>
          <span className="text-xs text-muted-foreground">{unit}</span>
        </span>
      ))}
    </div>
  );
}

function CountdownRow({ c, now }: { c: CountdownDto; now: number }) {
  return (
    <li
      className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0"
      data-testid="countdown"
      data-theme-id={c.themeId}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium">{c.title}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{deadlineLabel(c.at)}</span>
      </div>
      <CountdownDigits parts={countdownParts(c.at, now)} />
    </li>
  );
}

/** 今日页和本周页侧栏：各议题的倒计时，按秒跳动。 */
export function CountdownCard() {
  const countdowns = useCountdowns();
  const now = useNow();
  const list = countdowns.data ?? [];
  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <Hourglass className="size-4" />
          倒计时
        </span>
      }
      description={list.length === 0 ? '还没有议题设了倒计时。' : '离各个议题的截止还有多久。'}
      testId="countdown-card"
    >
      {list.length === 0 ? (
        <EmptyHint>
          在
          <Link to="/map" className="mx-1 underline">
            议题地图
          </Link>
          编辑议题，填上"倒计时截止"。
        </EmptyHint>
      ) : (
        <ul className="divide-y">
          {list.map((c) => (
            <CountdownRow key={c.themeId} c={c} now={now} />
          ))}
        </ul>
      )}
    </Section>
  );
}

/** 议题地图卡片上的一行倒计时。 */
export function ThemeCountdown({ at }: { at: string }) {
  const now = useNow();
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/50 px-3 py-2"
      data-testid="theme-countdown"
    >
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Hourglass className="size-3.5" />
        {deadlineLabel(at)} 截止
      </span>
      <CountdownDigits parts={countdownParts(at, now)} size="sm" />
    </div>
  );
}
