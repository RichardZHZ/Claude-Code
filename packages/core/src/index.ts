// 服务端入口（依赖 Node 与 SQLite）。前端请只导入 '@researchpilot/core/contracts' 和 '@researchpilot/core/week'。
export * from './schema.ts';
export * from './enums.ts';
export * from './week.ts';
export * from './errors.ts';
export * from './types.ts';
export * from './services/index.ts';
export { openDb, pingDb, type Db, type Conn, type Tx } from './db.ts';
export { runMigrations, MIGRATIONS_DIR } from './migrate.ts';
export { resolveDbPath, DEFAULT_DB_PATH } from './config.ts';
export { seedSampleData } from './seed.ts';
