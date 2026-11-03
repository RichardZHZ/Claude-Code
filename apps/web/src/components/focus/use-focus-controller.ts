import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { FocusMode } from '@researchpilot/core/enums';
import {
  focusAutoPaused,
  focusElapsedMs,
  focusPausedAt,
  focusPlannedEnd,
  focusReminderCount,
  focusRemainingMs,
  focusStretchMs,
  focusStretchStart,
  formatFocusDuration,
} from '@researchpilot/core/focus';
import { isoWeekKey, toDateString } from '@researchpilot/core/week';
import type { FocusSessionDto } from '@researchpilot/core/contracts';
import { useNow } from '@/lib/countdown';
import { useFocus, useFocusActions } from '@/lib/queries';
import { readStored, useStoredState, writeStored } from '@/lib/storage';

type ControllerOptions = {
  /** 多久向服务端刷新一次（毫秒）。 */
  refetchInterval?: number;
  /** 倒计时到点时调用（小窗用来发系统通知）。 */
  onTimerDone?: (session: FocusSessionDto) => void;
  /** 正计时连续满 4 小时自动暂停时调用（小窗用来发系统通知）。 */
  onAutoPause?: (session: FocusSessionDto) => void;
};

/**
 * 专心致志的状态与操作：主窗口的卡片和桌面小窗共用。
 * 选中的议题、计时方式、倒计时分钟数记在本机，下次打开还在。
 */
export function useFocusController(today: string, options: ControllerOptions = {}) {
  const focus = useFocus(today, options.refetchInterval ?? 30_000);
  const actions = useFocusActions();
  const qc = useQueryClient();
  const now = useNow();
  const [storedMode, setMode] = useStoredState<FocusMode>('rp.focus.mode', 'stopwatch');
  const [minutes, setMinutes] = useStoredState<number>('rp.focus.minutes', 25);
  const [storedTheme, setThemeId] = useStoredState<number | null>('rp.focus.theme', null);
  const [, rerender] = useState(0);

  const data = focus.data;
  const running = data?.running ?? null;
  const choices = (data?.themes ?? []).filter((t) => t.status !== 'closed');
  const themeId =
    running?.themeId ??
    (choices.some((t) => t.themeId === storedTheme) ? storedTheme : (choices[0]?.themeId ?? null));
  const mode = running?.mode ?? storedMode;
  const elapsed = running ? focusElapsedMs(running, now) : 0;
  const remaining = running ? focusRemainingMs(running, now) : null;
  const paused = running ? focusPausedAt(running, now) !== null : false;
  const autoPaused = running ? focusAutoPaused(running, now) : false;
  /** 当前这一段连续计时的标识：开始或继续都会换一个。 */
  const stretchKey = running ? `${running.id}:${focusStretchStart(running)}` : null;

  const callbacks = useRef(options);
  useEffect(() => {
    callbacks.current = options;
  });

  // 倒计时到点：服务端在下一次读取时自动存档，这里刷新一次并提示。
  const doneId = useRef<number | null>(null);
  const lastRunning = useRef<FocusSessionDto | null>(null);
  useEffect(() => {
    const finish = (s: FocusSessionDto) => {
      if (doneId.current === s.id) return;
      doneId.current = s.id;
      const planned = formatFocusDuration((s.plannedMinutes ?? 0) * 60_000);
      toast.success(`倒计时结束：${s.themeTitle} ${planned}，已存档`);
      callbacks.current.onTimerDone?.(s);
    };
    const prev = lastRunning.current;
    lastRunning.current = running;
    if (running && remaining === 0) {
      finish(running);
      void qc.invalidateQueries();
      return;
    }
    // 定时刷新可能先一步拿到"已结束"：原来那段倒计时（没在暂停）已经到点，也算自然结束。
    // 提前结束的（例如在另一个窗口点了"结束"）不在这里提示。
    const prevEnd = prev && prev.pausedAt === null ? focusPlannedEnd(prev) : null;
    if (prev && prev.id !== running?.id && prevEnd !== null && prevEnd <= Date.now()) finish(prev);
  }, [running, remaining, qc]);

  // 正计时连续满 4 小时：表盘已经按暂停计算，这里让服务端记下来；
  // 亲眼看着它从计时变成自动暂停的，再提示一次。
  const sawRunning = useRef<string | null>(null);
  const announced = useRef<string | null>(null);
  const synced = useRef<string | null>(null);
  useEffect(() => {
    if (!running || !stretchKey) return;
    if (!paused) {
      sawRunning.current = stretchKey;
      return;
    }
    if (!autoPaused) return;
    if (running.pausedAt === null && synced.current !== stretchKey) {
      synced.current = stretchKey;
      void qc.invalidateQueries();
    }
    if (sawRunning.current === stretchKey && announced.current !== stretchKey) {
      announced.current = stretchKey;
      toast.warning(`"${running.themeTitle}"已经连续计时 4 小时，自动暂停了`);
      callbacks.current.onAutoPause?.(running);
    }
  }, [running, stretchKey, paused, autoPaused, qc]);

  // 正计时每连续满两小时提醒一次，直到用户点"知道了"、暂停或结束；满 4 小时自动暂停。
  const reminders =
    running?.mode === 'stopwatch' && !paused ? focusReminderCount(focusStretchMs(running, now)) : 0;
  const ackKey = `rp.focus.ack.${stretchKey ?? 0}`;
  const reminderDue = reminders > 0 && reminders > readStored(ackKey, 0);

  // 正在进行的这一段算进它开始的那一天、那一周（和服务端的统计口径一致）。
  const startedDay = running ? toDateString(new Date(running.startedAt)) : null;
  const liveToday = startedDay === today ? elapsed : 0;
  const liveWeek = startedDay && isoWeekKey(startedDay) === isoWeekKey(today) ? elapsed : 0;

  // 当前议题的累计时间，加上正在进行的这一段。
  const base = data?.themes.find((t) => t.themeId === themeId);
  const ownLive = running && running.themeId === themeId;
  const totals = base && {
    todayMs: base.todayMs + (ownLive ? liveToday : 0),
    weekMs: base.weekMs + (ownLive ? liveWeek : 0),
    totalMs: base.totalMs + (ownLive ? elapsed : 0),
  };

  return {
    focus,
    data,
    running,
    choices,
    themeId,
    setThemeId,
    mode,
    setMode,
    minutes,
    setMinutes,
    elapsed,
    remaining,
    paused,
    autoPaused,
    reminderDue,
    reminders,
    stretchMs: running ? focusStretchMs(running, now) : 0,
    acknowledge: () => {
      writeStored(ackKey, reminders);
      rerender((n) => n + 1);
    },
    totals,
    /** 正在进行的一段在今天算多少（不是今天开始的为 0），用于各议题的今日合计。 */
    liveToday,
    /** 今天所有议题的专注时间，含正在进行的一段。 */
    dayTotalMs: (data?.todayMs ?? 0) + liveToday,
    /** 本周所有议题的专注时间，含正在进行的一段。 */
    weekTotalMs: (data?.weekMs ?? 0) + liveWeek,
    busy:
      actions.start.isPending ||
      actions.stop.isPending ||
      actions.pause.isPending ||
      actions.resume.isPending ||
      actions.remove.isPending,
    start: () => {
      if (themeId === null) return;
      actions.start.mutate({ themeId, mode, plannedMinutes: mode === 'timer' ? minutes : undefined });
    },
    stop: () => {
      if (running) actions.stop.mutate(running.id);
    },
    pause: () => {
      if (running) actions.pause.mutate(running.id);
    },
    resume: () => {
      if (running) actions.resume.mutate(running.id);
    },
    discard: () => {
      if (!running) return;
      if (window.confirm('放弃这段专注？不会存档。')) {
        actions.remove.mutate(running.id, { onSuccess: () => toast.success('已放弃这段专注') });
      }
    },
  };
}

export type FocusController = ReturnType<typeof useFocusController>;
