import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { Db } from './db.ts';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../drizzle', import.meta.url));

/** 把数据库升级到最新的表结构。重复执行是安全的。 */
export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
