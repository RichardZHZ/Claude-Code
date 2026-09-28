import { useEffect, useState } from 'react';

/** 每隔 intervalMs 更新一次的当前时间（毫秒），用来让倒计时按秒跳动。 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 截止时刻，本机时间：'2027年6月30日 18:00'（秒不为零时带秒）。 */
export function deadlineLabel(iso: string): string {
  const d = new Date(iso);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}${d.getSeconds() ? `:${pad(d.getSeconds())}` : ''}`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${time}`;
}
