import { migrateWithBackup } from '../backup.ts';
import { resolveBackupConfig, resolveDbPath } from '../config.ts';
import { openDb } from '../db.ts';

const path = resolveDbPath();
const db = openDb(path);
const backup = await migrateWithBackup(db, resolveBackupConfig(path).dir);
db.$client.close();
if (backup) console.log(`升级前已备份：${backup.path}`);
console.log(`数据库已升级到最新结构：${path}`);
