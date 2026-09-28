// 倒计时：把"截止时刻 - 现在"拆成天、时、分、秒。纯函数，前端和 MCP 共用。

export type CountdownParts = {
  /** 截止时刻已经过去（含正好到点）。 */
  expired: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** 距截止（或已超过）的总秒数，非负。 */
  totalSeconds: number;
};

export function countdownParts(
  at: Date | string | number,
  now: Date | string | number = Date.now(),
): CountdownParts {
  const diffMs = new Date(at).getTime() - new Date(now).getTime();
  const expired = diffMs <= 0;
  // 未到期时向上取整：还剩 0.4 秒显示 1 秒，到点那一刻才显示 0。
  const totalSeconds = expired ? Math.floor(Math.abs(diffMs) / 1000) : Math.ceil(diffMs / 1000);
  return {
    expired,
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
    totalSeconds,
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** '12 天 03:25:41'；不足一天时 '03:25:41'。 */
export function formatCountdownClock(p: CountdownParts): string {
  const clock = `${pad(p.hours)}:${pad(p.minutes)}:${pad(p.seconds)}`;
  return p.days > 0 ? `${p.days} 天 ${clock}` : clock;
}

/** '还剩 12 天 3 小时 25 分 41 秒' 或 '已超过 2 天 3 小时 0 分 5 秒'。 */
export function describeCountdown(
  at: Date | string | number,
  now: Date | string | number = Date.now(),
): string {
  const p = countdownParts(at, now);
  const body = `${p.days > 0 ? `${p.days} 天 ` : ''}${p.hours} 小时 ${p.minutes} 分 ${p.seconds} 秒`;
  return p.expired ? `已超过 ${body}` : `还剩 ${body}`;
}
