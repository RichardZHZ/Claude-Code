import type { TaskStatus } from '../enums.ts';
import type { Progress } from '../types.ts';

export function progressOf(done: number, total: number): Progress {
  return { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
}

/** 进度 = 已完成任务数 / 任务总数。 */
export function progressFromTasks(items: readonly { status: TaskStatus }[]): Progress {
  return progressOf(items.filter((t) => t.status === 'done').length, items.length);
}
