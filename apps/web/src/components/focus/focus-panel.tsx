import { Link } from '@tanstack/react-router';
import { AlarmClock, Play, Square, Target } from 'lucide-react';
import {
  FOCUS_MODE_LABELS,
  FOCUS_MODES,
  FOCUS_TIMER_PRESETS,
  MAX_FOCUS_TIMER_MINUTES,
} from '@researchpilot/core/enums';
import { formatFocusClock, formatFocusDuration } from '@researchpilot/core/focus';
import { EmptyHint, Section } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';
import { useFocusController, type FocusController } from './use-focus-controller';

const dur = formatFocusDuration;

/** 计时方式切换、议题选择、表盘、开始/结束按钮、两小时提醒和累计时间。 */
export function FocusControls({ ctl, compact = false }: { ctl: FocusController; compact?: boolean }) {
  const { running, mode, minutes } = ctl;
  const idle = running === null;

  if (ctl.focus.isPending) return <p className="py-2 text-xs text-muted-foreground">正在加载…</p>;
  if (ctl.choices.length === 0 && idle) {
    return (
      <EmptyHint className={cn(compact && 'text-xs')}>
        先在
        {compact ? (
          // 小窗里的链接在主窗口打开。
          <a href="/map" className="mx-1 underline" target="_blank" rel="noreferrer">
            议题地图
          </a>
        ) : (
          <Link to="/map" className="mx-1 underline">
            议题地图
          </Link>
        )}
        建一个议题，才能开始计时。
      </EmptyHint>
    );
  }

  const clock = idle
    ? formatFocusClock(mode === 'timer' ? minutes * 60_000 : 0)
    : formatFocusClock(ctl.remaining ?? ctl.elapsed);
  const caption = idle
    ? mode === 'timer'
      ? `倒计时 ${minutes} 分钟，到点自动存档`
      : '开始后计时，结束时再点一次'
    : mode === 'timer'
      ? `还剩 · 共 ${running.plannedMinutes} 分钟`
      : '已专注';

  return (
    <div className={cn('flex flex-col', compact ? 'gap-2' : 'gap-3')}>
      <div className="flex items-center gap-2">
        <div className="flex shrink-0 rounded-md border p-0.5" role="group" aria-label="计时方式">
          {FOCUS_MODES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              disabled={!idle}
              onClick={() => ctl.setMode(m)}
              className={cn(
                'rounded-[5px] px-2 py-0.5 text-xs transition-colors disabled:cursor-not-allowed',
                mode === m
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {FOCUS_MODE_LABELS[m]}
            </button>
          ))}
        </div>
        <NativeSelect
          aria-label="专注的议题"
          className={cn('min-w-0 flex-1', compact && '[&>select]:h-7 [&>select]:text-xs')}
          value={ctl.themeId ?? ''}
          disabled={!idle}
          onChange={(e) => ctl.setThemeId(Number(e.target.value))}
        >
          {idle ? (
            ctl.choices.map((t) => (
              <option key={t.themeId} value={t.themeId}>
                {t.title}
              </option>
            ))
          ) : (
            <option value={running.themeId}>{running.themeTitle}</option>
          )}
        </NativeSelect>
      </div>

      {idle && mode === 'timer' && (
        <div className="flex flex-wrap items-center gap-1.5">
          {FOCUS_TIMER_PRESETS.map((p) => (
            <Button
              key={p}
              type="button"
              variant={minutes === p ? 'secondary' : 'ghost'}
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => ctl.setMinutes(p)}
            >
              {p}
            </Button>
          ))}
          <Input
            type="number"
            min={1}
            max={MAX_FOCUS_TIMER_MINUTES}
            aria-label="倒计时分钟数"
            className="h-6 w-16 px-2 text-xs"
            value={minutes}
            onChange={(e) => {
              const v = Math.round(Number(e.target.value));
              if (Number.isFinite(v)) ctl.setMinutes(Math.min(MAX_FOCUS_TIMER_MINUTES, Math.max(1, v)));
            }}
          />
          <span className="text-xs text-muted-foreground">分钟</span>
        </div>
      )}

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div
            role="timer"
            aria-label={idle ? '专注计时' : `${caption} ${clock}`}
            data-testid="focus-clock"
            className={cn(
              'leading-none font-semibold tabular-nums',
              compact ? 'text-3xl' : 'text-4xl',
              idle && 'text-muted-foreground/70',
            )}
          >
            {clock}
          </div>
          <p className="mt-1.5 truncate text-xs text-muted-foreground">{caption}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {idle ? (
            <Button
              size={compact ? 'sm' : 'default'}
              disabled={ctl.busy || ctl.themeId === null}
              onClick={ctl.start}
            >
              <Play />
              开始
            </Button>
          ) : (
            <>
              {!compact && (
                <Button variant="ghost" size="sm" disabled={ctl.busy} onClick={ctl.discard}>
                  放弃
                </Button>
              )}
              <Button
                size={compact ? 'sm' : 'default'}
                variant="destructive"
                disabled={ctl.busy}
                onClick={ctl.stop}
                aria-label="结束并存档"
              >
                <Square />
                结束
              </Button>
            </>
          )}
        </div>
      </div>

      {ctl.reminderDue && (
        <div
          role="alert"
          data-testid="focus-reminder"
          className="flex items-start gap-2 rounded-md border border-amber-500/50 bg-amber-500/15 px-2.5 py-2 text-xs"
        >
          <AlarmClock className="mt-px size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="min-w-0 flex-1">
            已经连续专注 {dur(ctl.elapsed)}，起来活动一下吧。计时不会自动停止，要结束请点"结束"。
          </span>
          <button
            type="button"
            className="shrink-0 font-medium underline-offset-2 hover:underline"
            onClick={ctl.acknowledge}
          >
            知道了
          </button>
        </div>
      )}

      {ctl.totals && (
        <p className="text-xs text-muted-foreground" data-testid="focus-totals">
          今天 {dur(ctl.totals.todayMs)} · 本周 {dur(ctl.totals.weekMs)} · 累计 {dur(ctl.totals.totalMs)}
        </p>
      )}
    </div>
  );
}

/** 今日页、本周页侧栏：倒计时下面的"专心致志"。 */
export function FocusTimerCard({ today }: { today: string }) {
  const ctl = useFocusController(today);
  const worked = (ctl.data?.themes ?? []).filter((t) => t.totalMs > 0 || t.themeId === ctl.running?.themeId);
  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <Target className="size-4" />
          专心致志
        </span>
      }
      description="选好议题，正计时或倒计时，每一段都会存档。"
      testId="focus-card"
    >
      <div className="flex flex-col gap-4">
        <FocusControls ctl={ctl} />
        {worked.length > 0 && (
          <div className="border-t pt-3">
            <div className="mb-1.5 flex items-baseline justify-between text-xs text-muted-foreground">
              <span>各议题的专注时间</span>
              <Link to="/review" className="hover:text-foreground hover:underline">
                按天回顾
              </Link>
            </div>
            <ul className="flex flex-col gap-1 text-sm" data-testid="focus-theme-totals">
              {worked.map((t) => {
                const live = ctl.running?.themeId === t.themeId ? ctl.elapsed : 0;
                return (
                  <li key={t.themeId} className="flex items-baseline justify-between gap-2">
                    <span className="truncate">{t.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      今天 {dur(t.todayMs + live)} · 累计 {dur(t.totalMs + live)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </Section>
  );
}
