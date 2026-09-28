import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 默认数据库位置：仓库根目录下的 data/researchpilot.db。可用环境变量 DB_PATH 覆盖。 */
export const DEFAULT_DB_PATH = fileURLToPath(new URL('../../../data/researchpilot.db', import.meta.url));

export function resolveDbPath(): string {
  return process.env.DB_PATH ?? DEFAULT_DB_PATH;
}

/** Zotero 本地 API 的地址。Zotero 7 默认监听 23119 端口，可用环境变量 ZOTERO_URL 覆盖。 */
export const DEFAULT_ZOTERO_URL = 'http://127.0.0.1:23119';

export function resolveZoteroUrl(): string {
  return process.env.ZOTERO_URL ?? DEFAULT_ZOTERO_URL;
}

export type BackupConfig = {
  /** 备份目录，默认在数据库旁边的 backups/。 */
  dir: string;
  /** 最多保留几份。 */
  keep: number;
  /** 自动备份的间隔（小时）。 */
  intervalHours: number;
  /** 是否在应用运行时自动备份。设 AUTO_BACKUP=off 关闭。 */
  auto: boolean;
};

function positiveNumber(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 备份设置：BACKUP_DIR、BACKUP_KEEP（默认 30）、BACKUP_INTERVAL_HOURS（默认 24）、AUTO_BACKUP。 */
export function resolveBackupConfig(dbPath: string = resolveDbPath()): BackupConfig {
  return {
    dir: process.env.BACKUP_DIR ?? join(dirname(dbPath), 'backups'),
    keep: Math.floor(positiveNumber(process.env.BACKUP_KEEP, 30)),
    intervalHours: positiveNumber(process.env.BACKUP_INTERVAL_HOURS, 24),
    auto: process.env.AUTO_BACKUP !== 'off',
  };
}
