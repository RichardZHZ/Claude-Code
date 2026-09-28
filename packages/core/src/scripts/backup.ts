// pnpm db:backup：立即备份一次，并按 BACKUP_KEEP 清理旧备份。
// pnpm db:backup --list：列出已有备份。
import { backupDatabase, listBackups, pruneBackups } from '../backup.ts';
import { resolveBackupConfig, resolveDbPath } from '../config.ts';
import { openDb } from '../db.ts';

const path = resolveDbPath();
const config = resolveBackupConfig(path);

if (process.argv.includes('--list')) {
  const backups = listBackups(config.dir);
  if (backups.length === 0) console.log(`还没有备份（${config.dir}）`);
  for (const b of backups) {
    console.log(
      `${b.createdAt.toLocaleString('zh-CN')}  ${(b.size / 1024).toFixed(0).padStart(6)} KB  ${b.path}`,
    );
  }
} else {
  const db = openDb(path);
  const info = await backupDatabase(db, config.dir, 'manual');
  db.$client.close();
  const removed = pruneBackups(config.dir, config.keep);
  console.log(`已备份：${info.path}`);
  if (removed.length > 0) console.log(`已清理 ${removed.length} 份旧备份（保留最新 ${config.keep} 份）`);
}
