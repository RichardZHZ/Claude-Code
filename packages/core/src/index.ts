// 服务端入口（依赖 Node 与 SQLite）。前端请只导入 '@researchpilot/core/contracts' 和 '@researchpilot/core/week'。
export * from './schema.ts';
export * from './enums.ts';
export * from './week.ts';
export * from './countdown.ts';
export * from './focus.ts';
export * from './errors.ts';
export * from './types.ts';
export * from './rules/health.ts';
export * from './services/index.ts';
export { openDb, pingDb, type Db, type Conn, type Tx } from './db.ts';
export { runMigrations, MIGRATIONS_DIR } from './migrate.ts';
export {
  resolveDbPath,
  DEFAULT_DB_PATH,
  defaultDataDir,
  resolveZoteroUrl,
  DEFAULT_ZOTERO_URL,
  resolveBackupConfig,
  type BackupConfig,
} from './config.ts';
export * from './backup.ts';
export { seedSampleData } from './seed.ts';
export * from './zotero.ts';
