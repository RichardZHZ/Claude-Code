import { openDb } from '../db.ts';
import { resolveDbPath } from '../config.ts';
import { runMigrations } from '../migrate.ts';

const path = resolveDbPath();
const db = openDb(path);
runMigrations(db);
db.$client.close();
console.log(`数据库已升级到最新结构：${path}`);
