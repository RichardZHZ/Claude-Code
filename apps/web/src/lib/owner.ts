import { useState } from 'react';
import { useOwners } from './queries';

/** 任务归属的编码：'p:12' 表示课题 12，'t:3' 表示议题 3。 */
export type OwnerValue = `p:${number}` | `t:${number}` | '';

export function encodeOwner(owner: { projectId?: number | null; themeId?: number | null }): OwnerValue {
  if (owner.projectId) return `p:${owner.projectId}`;
  if (owner.themeId) return `t:${owner.themeId}`;
  return '';
}

export function decodeOwner(value: string): { projectId: number | null; themeId: number | null } {
  const [kind, raw] = value.split(':');
  const id = Number(raw);
  if (kind === 'p' && id > 0) return { projectId: id, themeId: null };
  if (kind === 't' && id > 0) return { projectId: null, themeId: id };
  return { projectId: null, themeId: null };
}

const LAST_OWNER_KEY = 'researchpilot.lastOwner';

/** 上次新建任务时选的归属，方便连续添加。读写失败时静默忽略。 */
export function readLastOwner(): OwnerValue {
  try {
    const v = localStorage.getItem(LAST_OWNER_KEY) ?? '';
    return /^[pt]:\d+$/.test(v) ? (v as OwnerValue) : '';
  } catch {
    return '';
  }
}

export function writeLastOwner(value: OwnerValue): void {
  try {
    localStorage.setItem(LAST_OWNER_KEY, value);
  } catch {
    // 浏览器禁用了本地存储时忽略。
  }
}

/**
 * 当前选中的归属：默认取上次用过的；它已被删除或结束时退回到第一个可选项。
 */
export function useOwnerChoice() {
  const owners = useOwners();
  const [chosen, setChosen] = useState<OwnerValue>(() => readLastOwner());
  const options: OwnerValue[] = [
    ...(owners.data?.projects ?? []).map((p) => `p:${p.id}` as const),
    ...(owners.data?.themes ?? []).map((t) => `t:${t.id}` as const),
  ];
  const effective: OwnerValue = options.includes(chosen) ? chosen : (options[0] ?? '');
  return { owner: effective, setOwner: setChosen, hasOptions: options.length > 0, loaded: owners.isSuccess };
}
