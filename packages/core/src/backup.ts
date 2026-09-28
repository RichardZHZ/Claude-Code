// 数据库备份与恢复（仅服务端）。
// 备份用 SQLite 的在线备份接口，应用运行中也能得到一致的副本，WAL 模式下同样安全。

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { BackupConfig } from './config.ts';
import type { Db } from './db.ts';
import { BACKUP_REASONS, type BackupReason } from './enums.ts';
import { invalid, notFound } from './errors.ts';
import { MIGRATIONS_DIR, runMigrations } from './migrate.ts';
import type { BackupInfo, BackupStatus } from './types.ts';

/** 只需要底层 SQLite 连接。 */
type HasClient = Pick<Db, '$client'>;

const NAME_RE = new RegExp(
  `^researchpilot-(\\d{8})-(\\d{6})(?:-(\\d+))?-(${BACKUP_REASONS.join('|')})\\.db$`,
);

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** 本地时间的 'YYYYMMDD-HHmmss'。 */
function stamp(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function parseName(file: string): { createdAt: Date; seq: number; reason: BackupReason } | null {
  const m = NAME_RE.exec(file);
  if (!m) return null;
  const [, ymd, hms, seq, reason] = m;
  const createdAt = new Date(
    Number(ymd!.slice(0, 4)),
    Number(ymd!.slice(4, 6)) - 1,
    Number(ymd!.slice(6, 8)),
    Number(hms!.slice(0, 2)),
    Number(hms!.slice(2, 4)),
    Number(hms!.slice(4, 6)),
  );
  return { createdAt, seq: Number(seq ?? 0), reason: reason as BackupReason };
}

/** 备份目录里的备份，最新的在前。目录不存在时返回空列表。 */
export function listBackups(dir: string): BackupInfo[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((file) => ({ file, parsed: parseName(file) }))
    .filter(
      (x): x is { file: string; parsed: NonNullable<ReturnType<typeof parseName>> } => x.parsed !== null,
    )
    .sort(
      (a, b) => b.parsed.createdAt.getTime() - a.parsed.createdAt.getTime() || b.parsed.seq - a.parsed.seq,
    )
    .map(({ file, parsed }) => {
      const path = join(dir, file);
      return { file, path, createdAt: parsed.createdAt, reason: parsed.reason, size: statSync(path).size };
    });
}

export function latestBackup(dir: string): BackupInfo | null {
  return listBackups(dir)[0] ?? null;
}

/** 做一份备份。同一秒内多次备份会自动加序号，不会覆盖。 */
export async function backupDatabase(
  db: HasClient,
  dir: string,
  reason: BackupReason = 'manual',
  now: Date = new Date(),
): Promise<BackupInfo> {
  mkdirSync(dir, { recursive: true });
  const base = `researchpilot-${stamp(now)}`;
  let file = `${base}-${reason}.db`;
  for (let seq = 1; existsSync(join(dir, file)); seq++) file = `${base}-${seq}-${reason}.db`;
  const path = join(dir, file);
  await db.$client.backup(path);
  // 备份会继承原库的 WAL 模式；改回普通日志模式，让备份始终是一个独立的文件。
  const copy = new Database(path);
  copy.pragma('journal_mode = DELETE');
  copy.close();
  return { file, path, createdAt: now, reason, size: statSync(path).size };
}

/** 只保留最新的 keep 份，返回删除的文件名。 */
export function pruneBackups(dir: string, keep: number): string[] {
  const stale = listBackups(dir).slice(Math.max(keep, 1));
  for (const b of stale) rmSync(b.path, { force: true });
  return stale.map((b) => b.file);
}

/** 备份页面与侧栏显示用的状态。 */
export function getBackupStatus(config: BackupConfig, now: Date = new Date()): BackupStatus {
  const items = listBackups(config.dir);
  const latest = items[0] ?? null;
  const overdue = latest
    ? now.getTime() - latest.createdAt.getTime() > 2 * config.intervalHours * 3_600_000
    : !config.auto;
  return {
    dir: config.dir,
    auto: config.auto,
    intervalHours: config.intervalHours,
    keep: config.keep,
    latest,
    overdue,
    items,
  };
}

// ---------- 迁移前备份 ----------

export type MigrationStatus = {
  /** 已执行的迁移数。 */
  applied: number;
  /** 代码里的迁移总数。 */
  total: number;
  /** 数据库里还没有任何业务表（新建的库）。 */
  fresh: boolean;
};

export function migrationStatus(db: HasClient): MigrationStatus {
  const journal = JSON.parse(readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8')) as {
    entries: unknown[];
  };
  const tables = db.$client
    .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'")
    .all() as { name: string }[];
  const names = new Set(tables.map((t) => t.name));
  const applied = names.has('__drizzle_migrations')
    ? (db.$client.prepare('select count(*) as n from __drizzle_migrations').get() as { n: number }).n
    : 0;
  names.delete('__drizzle_migrations');
  return { applied, total: journal.entries.length, fresh: names.size === 0 };
}

/**
 * 升级表结构。有待执行的迁移、且库里已有数据时，先备份一份再升级。
 * 返回升级前做的备份（没有则为 null）。
 */
export async function migrateWithBackup(db: Db, backupDir: string): Promise<BackupInfo | null> {
  const status = migrationStatus(db);
  let backup: BackupInfo | null = null;
  if (!status.fresh && status.applied < status.total) {
    backup = await backupDatabase(db, backupDir, 'before-migration');
  }
  runMigrations(db);
  return backup;
}

// ---------- 定时备份 ----------

/** 距上次备份超过设定间隔时备份一次并清理旧备份；否则什么都不做，返回 null。 */
export async function runScheduledBackup(
  db: HasClient,
  config: Pick<BackupConfig, 'dir' | 'keep' | 'intervalHours'>,
  now: Date = new Date(),
): Promise<BackupInfo | null> {
  const last = latestBackup(config.dir);
  if (last && now.getTime() - last.createdAt.getTime() < config.intervalHours * 3_600_000) return null;
  const info = await backupDatabase(db, config.dir, 'scheduled', now);
  pruneBackups(config.dir, config.keep);
  return info;
}

/**
 * 在应用运行期间定时备份：启动时检查一次，之后每小时检查一次是否到了备份时间。
 * 计时器不会阻止进程退出。
 */
export function startBackupScheduler(
  db: HasClient,
  config: BackupConfig,
  log: (message: string) => void = (m) => console.error(m),
): { stop: () => void } {
  if (!config.auto) return { stop: () => {} };
  const tick = () => {
    runScheduledBackup(db, config)
      .then((info) => {
        if (info) log(`已自动备份数据库：${info.path}`);
      })
      .catch((err: unknown) => log(`自动备份失败：${err instanceof Error ? err.message : String(err)}`));
  };
  tick();
  const timer = setInterval(tick, 3_600_000);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}

// ---------- 恢复 ----------

/** 检查文件是不是科研小助理的数据库。 */
function assertResearchPilotDb(path: string): void {
  if (!existsSync(path)) throw notFound('备份文件', path);
  let ok: boolean;
  try {
    const probe = new Database(path, { readonly: true, fileMustExist: true });
    try {
      ok =
        probe.prepare("select 1 from sqlite_master where type = 'table' and name = 'themes'").get() !==
        undefined;
    } finally {
      probe.close();
    }
  } catch {
    ok = false;
  }
  if (!ok) throw invalid(`这不是科研小助理的数据库文件：${path}`);
}

/**
 * 用备份覆盖数据库。必须先停掉应用（网页服务和 MCP 服务器）。
 * 覆盖前会把当前数据库另存为一份 before-restore 备份，返回这份备份（原库不存在时为 null）。
 */
export async function restoreDatabase(
  backupPath: string,
  dbPath: string,
  backupDir: string,
): Promise<BackupInfo | null> {
  assertResearchPilotDb(backupPath);
  let safety: BackupInfo | null = null;
  if (existsSync(dbPath)) {
    const current = new Database(dbPath);
    try {
      safety = await backupDatabase({ $client: current }, backupDir, 'before-restore');
    } finally {
      current.close();
    }
  }
  copyFileSync(backupPath, dbPath);
  // 旧库的日志文件如果留着，会在下次打开时被回放到恢复后的库上。
  for (const suffix of ['-wal', '-shm']) rmSync(`${dbPath}${suffix}`, { force: true });
  return safety;
}
