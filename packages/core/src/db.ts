import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.ts';

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };
/** 事务内的连接。 */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** 服务层函数接受普通连接或事务，便于组合成更大的事务。 */
export type Conn = Db | Tx;

/**
 * 打开 SQLite 数据库。传 ':memory:' 得到内存库（测试用）。
 * 会自动创建上级目录，并开启外键约束和 WAL 日志。
 */
export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const client = new Database(path);
  client.pragma('journal_mode = WAL');
  client.pragma('foreign_keys = ON');
  return drizzle({ client, schema });
}

/** 数据库是否可用（健康检查用）。 */
export function pingDb(db: Db): boolean {
  try {
    return db.$client.prepare('select 1 as ok').get() !== undefined;
  } catch {
    return false;
  }
}
