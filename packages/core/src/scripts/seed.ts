import { openDb } from '../db.ts';
import { resolveDbPath } from '../config.ts';
import { runMigrations } from '../migrate.ts';
import { seedSampleData } from '../seed.ts';
import { toDateString } from '../week.ts';

const path = resolveDbPath();
const db = openDb(path);
runMigrations(db);
const seeded = seedSampleData(db, toDateString(new Date()));
db.$client.close();
console.log(seeded ? `已写入示例数据：${path}` : `数据库里已有议题，跳过示例数据：${path}`);
