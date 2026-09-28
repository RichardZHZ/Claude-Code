import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { Db } from './db.ts';

/** 迁移 SQL 所在目录。桌面应用把代码打包成单个文件后，用环境变量 MIGRATIONS_DIR 指明位置。 */
export const MIGRATIONS_DIR =
  process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL('../drizzle', import.meta.url));

/** 把数据库升级到最新的表结构。重复执行是安全的。 */
export function runMigrations(db: Db): void {
  migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
