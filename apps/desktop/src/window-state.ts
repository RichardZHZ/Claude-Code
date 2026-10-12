// 记住窗口的位置和大小：主窗口和桌面小窗共用。状态存成 userData 里的小 JSON 文件。

import { readFileSync, writeFileSync } from 'node:fs';
import { screen, type BrowserWindow, type Rectangle } from 'electron';

export function readJson<T extends object>(file: string, fallback: T): T {
  try {
    return { ...fallback, ...(JSON.parse(readFileSync(file, 'utf8')) as Partial<T>) };
  } catch {
    return fallback;
  }
}

export function writeJson(file: string, value: unknown): void {
  try {
    writeFileSync(file, JSON.stringify(value, null, 2));
  } catch {
    // 记不住位置也不影响使用。
  }
}

/** 保存的位置是否还在某块屏幕上（例如外接显示器拔掉后就不在了）。 */
export function isOnScreen(b: Rectangle): boolean {
  const area = screen.getDisplayMatching(b).workArea;
  return (
    b.x < area.x + area.width - 40 &&
    b.x + b.width > area.x + 40 &&
    b.y >= area.y - 10 &&
    b.y < area.y + area.height - 40
  );
}

/** 窗口移动或调整大小后（停下 400 毫秒）保存一次；关闭前（包括退出应用时）立即保存。 */
export function trackBounds(win: BrowserWindow, save: () => void): void {
  let timer: NodeJS.Timeout | undefined;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!win.isDestroyed()) save();
    }, 400);
  };
  win.on('move', later);
  win.on('resize', later);
  win.on('close', () => {
    clearTimeout(timer);
    save();
  });
}
