import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  backupDatabase,
  getBackupStatus,
  latestBackup,
  listBackups,
  migrateWithBackup,
  migrationStatus,
  pruneBackups,
  restoreDatabase,
  runScheduledBackup,
} from './backup.ts';
import { openDb, type Db } from './db.ts';
import { MIGRATIONS_DIR, runMigrations } from './migrate.ts';
import { createTheme, listThemes } from './services/themes.ts';

let tmp: string;
let dbPath: string;
let backupDir: string;
let db: Db;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'rp-backup-'));
  dbPath = join(tmp, 'researchpilot.db');
  backupDir = join(tmp, 'backups');
  db = openDb(dbPath);
  runMigrations(db);
});

afterEach(() => {
  if (db.$client.open) db.$client.close();
  rmSync(tmp, { recursive: true, force: true });
});

const at = (iso: string) => new Date(iso);

function themeTitles(path: string): string[] {
  const conn = openDb(path);
  try {
    return listThemes(conn).map((t) => t.title);
  } finally {
    conn.$client.close();
  }
}

describe('备份', () => {
  it('备份是一个可以直接打开的完整数据库', async () => {
    createTheme(db, { title: '城市热岛' });
    const info = await backupDatabase(db, backupDir, 'manual', at('2026-09-28T10:00:00'));
    expect(info.file).toBe('researchpilot-20260928-100000-manual.db');
    expect(info.size).toBeGreaterThan(0);
    const copy = new Database(info.path, { readonly: true });
    expect(copy.pragma('journal_mode', { simple: true })).toBe('delete');
    copy.close();
    expect(themeTitles(info.path)).toEqual(['城市热岛']);
  });

  it('同一秒内多次备份不会互相覆盖，列表按时间倒序', async () => {
    const now = at('2026-09-28T10:00:00');
    await backupDatabase(db, backupDir, 'manual', at('2026-09-27T09:00:00'));
    const a = await backupDatabase(db, backupDir, 'manual', now);
    const b = await backupDatabase(db, backupDir, 'manual', now);
    expect(a.file).not.toBe(b.file);
    expect(listBackups(backupDir).map((x) => x.file)).toEqual([
      b.file,
      a.file,
      'researchpilot-20260927-090000-manual.db',
    ]);
    expect(latestBackup(backupDir)?.file).toBe(b.file);
  });

  it('忽略目录里的其他文件；目录不存在时返回空列表', async () => {
    expect(listBackups(join(tmp, 'nope'))).toEqual([]);
    await backupDatabase(db, backupDir, 'manual', at('2026-09-28T10:00:00'));
    writeFileSync(join(backupDir, 'notes.txt'), 'x');
    writeFileSync(join(backupDir, 'researchpilot-2026-manual.db'), 'x');
    expect(listBackups(backupDir)).toHaveLength(1);
  });

  it('清理时只保留最新的若干份', async () => {
    for (let d = 1; d <= 5; d++) {
      await backupDatabase(db, backupDir, 'scheduled', at(`2026-09-0${d}T03:00:00`));
    }
    const removed = pruneBackups(backupDir, 3);
    expect(removed).toEqual([
      'researchpilot-20260902-030000-scheduled.db',
      'researchpilot-20260901-030000-scheduled.db',
    ]);
    expect(listBackups(backupDir).map((b) => b.createdAt.getDate())).toEqual([5, 4, 3]);
  });
});

describe('定时备份', () => {
  const config = { dir: '', keep: 2, intervalHours: 24 };
  beforeEach(() => {
    config.dir = backupDir;
  });

  it('没有备份时立即备份，未到间隔时跳过，到了再备份并清理旧的', async () => {
    expect(await runScheduledBackup(db, config, at('2026-09-01T08:00:00'))).not.toBeNull();
    expect(await runScheduledBackup(db, config, at('2026-09-01T20:00:00'))).toBeNull();
    expect(await runScheduledBackup(db, config, at('2026-09-02T08:00:00'))).not.toBeNull();
    const third = await runScheduledBackup(db, config, at('2026-09-03T09:00:00'));
    expect(third?.reason).toBe('scheduled');
    expect(listBackups(backupDir).map((b) => b.createdAt.getDate())).toEqual([3, 2]);
  });

  it('手动备份也算作最近一次备份', async () => {
    await backupDatabase(db, backupDir, 'manual', at('2026-09-01T08:00:00'));
    expect(await runScheduledBackup(db, config, at('2026-09-01T09:00:00'))).toBeNull();
  });
});

describe('备份状态', () => {
  const config = () => ({ dir: backupDir, keep: 30, intervalHours: 24, auto: true });

  it('从未备份：开着自动备份不算逾期，关掉则提示', () => {
    expect(getBackupStatus(config())).toMatchObject({ latest: null, overdue: false, items: [] });
    expect(getBackupStatus({ ...config(), auto: false }).overdue).toBe(true);
  });

  it('超过两个间隔没有备份时提示', async () => {
    await backupDatabase(db, backupDir, 'scheduled', at('2026-09-01T08:00:00'));
    expect(getBackupStatus(config(), at('2026-09-03T07:00:00')).overdue).toBe(false);
    const status = getBackupStatus(config(), at('2026-09-03T09:00:00'));
    expect(status.overdue).toBe(true);
    expect(status.latest?.reason).toBe('scheduled');
    expect(status.items).toHaveLength(1);
  });
});

describe('迁移前备份', () => {
  /** 做一个只执行了第一个迁移的旧数据库。 */
  function openOldDb(path: string): Db {
    const folder = join(tmp, 'old-migrations');
    cpSync(MIGRATIONS_DIR, folder, { recursive: true });
    const journalPath = join(folder, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: unknown[] };
    journal.entries = journal.entries.slice(0, 1);
    writeFileSync(journalPath, JSON.stringify(journal));
    const old = openDb(path);
    migrate(old, { migrationsFolder: folder });
    return old;
  }

  it('最新的库没有待执行的迁移', () => {
    const status = migrationStatus(db);
    expect(status.applied).toBe(status.total);
    expect(status.fresh).toBe(false);
  });

  it('新建的空库直接迁移，不做备份', async () => {
    const fresh = openDb(join(tmp, 'fresh.db'));
    expect(migrationStatus(fresh)).toMatchObject({ applied: 0, fresh: true });
    expect(await migrateWithBackup(fresh, backupDir)).toBeNull();
    expect(listBackups(backupDir)).toEqual([]);
    fresh.$client.close();
  });

  it('旧库升级前先备份，备份里保留升级前的结构', async () => {
    const old = openOldDb(join(tmp, 'old.db'));
    old.$client.prepare("insert into themes (title, created_at, updated_at) values ('旧议题', 0, 0)").run();
    const status = migrationStatus(old);
    expect(status.applied).toBe(1);
    expect(status.total).toBeGreaterThan(1);

    const backup = await migrateWithBackup(old, backupDir);
    expect(backup?.reason).toBe('before-migration');
    expect(migrationStatus(old).applied).toBe(status.total);
    expect(listThemes(old).map((t) => t.title)).toEqual(['旧议题']);
    old.$client.close();

    const snapshot = new Database(backup!.path, { readonly: true });
    const n = snapshot.prepare('select count(*) as n from __drizzle_migrations').get() as { n: number };
    snapshot.close();
    expect(n.n).toBe(1);

    // 再次启动时已是最新，不再备份。
    const again = openDb(join(tmp, 'old.db'));
    expect(await migrateWithBackup(again, backupDir)).toBeNull();
    again.$client.close();
  });
});

describe('恢复', () => {
  it('用备份覆盖数据库，并先把当前数据库另存一份', async () => {
    createTheme(db, { title: '备份前' });
    const backup = await backupDatabase(db, backupDir, 'manual', at('2026-09-01T08:00:00'));
    createTheme(db, { title: '备份后' });
    db.$client.close();

    const safety = await restoreDatabase(backup.path, dbPath, backupDir);
    expect(safety?.reason).toBe('before-restore');
    expect(themeTitles(dbPath)).toEqual(['备份前']);
    expect(themeTitles(safety!.path).sort()).toEqual(['备份前', '备份后'].sort());
    expect(existsSync(`${dbPath}-wal`)).toBe(false);
    expect(existsSync(`${backup.path}-wal`)).toBe(false);
  });

  it('数据库文件不存在时也能恢复', async () => {
    const backup = await backupDatabase(db, backupDir, 'manual');
    db.$client.close();
    rmSync(dbPath);
    await expect(restoreDatabase(backup.path, dbPath, backupDir)).resolves.toBeNull();
    expect(themeTitles(dbPath)).toEqual([]);
  });

  it('拒绝不存在或不是本应用数据库的文件', async () => {
    await expect(restoreDatabase(join(tmp, 'missing.db'), dbPath, backupDir)).rejects.toMatchObject({
      code: 'not_found',
    });
    const junk = join(tmp, 'junk.db');
    writeFileSync(junk, 'not a database');
    await expect(restoreDatabase(junk, dbPath, backupDir)).rejects.toMatchObject({ code: 'invalid' });
    const other = new Database(join(tmp, 'other.db'));
    other.exec('create table notes (id integer)');
    other.close();
    await expect(restoreDatabase(join(tmp, 'other.db'), dbPath, backupDir)).rejects.toMatchObject({
      code: 'invalid',
    });
  });
});
