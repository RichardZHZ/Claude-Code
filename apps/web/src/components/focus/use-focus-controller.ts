import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { FocusMode } from '@researchpilot/core/enums';
import {
  focusElapsedMs,
  focusPlannedEnd,
  focusReminderCount,
  focusRemainingMs,
  formatFocusDuration,
} from '@researchpilot/core/focus';
import type { FocusSessionDto } from '@researchpilot/core/contracts';
import { useNow } from '@/lib/countdown';
import { useFocus, useFocusActions } from '@/lib/queries';
import { readStored, useStoredState, writeStored } from '@/lib/storage';

type ControllerOptions = {
  /** 多久向服务端刷新一次（毫秒）。 */
  refetchInterval?: number;
  /** 倒计时到点时调用（小窗用来发系统通知）。 */
  onTimerDone?: (session: FocusSessionDto) => void;
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

  // 倒计时到点：服务端在下一次读取时自动存档，这里刷新一次并提示。
  const onTimerDone = useRef(options.onTimerDone);
  useEffect(() => {
    onTimerDone.current = options.onTimerDone;
  });
  const doneId = useRef<number | null>(null);
  const lastRunning = useRef<FocusSessionDto | null>(null);
  useEffect(() => {
    const finish = (s: FocusSessionDto) => {
      if (doneId.current === s.id) return;
      doneId.current = s.id;
      const planned = formatFocusDuration((s.plannedMinutes ?? 0) * 60_000);
      toast.success(`倒计时结束：${s.themeTitle} ${planned}，已存档`);
      onTimerDone.current?.(s);
    };
    const prev = lastRunning.current;
    lastRunning.current = running;
    if (running && remaining === 0) {
      finish(running);
      void qc.invalidateQueries();
      return;
    }
    // 定时刷新可能先一步拿到"已结束"：原来那段倒计时已经到点，也算自然结束。
    // 提前结束的（例如在另一个窗口点了"结束"）不在这里提示。
    const prevEnd = prev ? focusPlannedEnd(prev) : null;
    if (prev && prev.id !== running?.id && prevEnd !== null && prevEnd <= Date.now()) finish(prev);
  }, [running, remaining, qc]);

  // 正计时每满两小时提醒一次，直到用户点"知道了"或结束；不会自动停止。
  const reminders = running?.mode === 'stopwatch' ? focusReminderCount(elapsed) : 0;
  const ackKey = `rp.focus.ack.${running?.id ?? 0}`;
  const reminderDue = reminders > 0 && reminders > readStored(ackKey, 0);

  // 当前议题的累计时间，加上正在进行的这一段。
  const base = data?.themes.find((t) => t.themeId === themeId);
  const live = running && running.themeId === themeId ? elapsed : 0;
  const totals = base && {
    todayMs: base.todayMs + live,
    weekMs: base.weekMs + live,
    totalMs: base.totalMs + live,
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
    reminderDue,
    reminders,
    acknowledge: () => {
      writeStored(ackKey, reminders);
      rerender((n) => n + 1);
    },
    totals,
    /** 今天所有议题的专注时间，含正在进行的一段。 */
    todayAllMs: (data?.todayMs ?? 0) + (running ? elapsed : 0),
    busy: actions.start.isPending || actions.stop.isPending || actions.remove.isPending,
    start: () => {
      if (themeId === null) return;
      actions.start.mutate({ themeId, mode, plannedMinutes: mode === 'timer' ? minutes : undefined });
    },
    stop: () => {
      if (running) actions.stop.mutate(running.id);
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
