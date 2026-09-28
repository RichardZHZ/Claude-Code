import { Hono } from 'hono';
import {
  backupDatabase,
  getBackupStatus,
  pruneBackups,
  type BackupConfig,
  type Db,
} from '@researchpilot/core';

/** 数据库备份：查看状态、立即备份。恢复需要先停掉服务，只能用命令行 pnpm db:restore。 */
export function backupRoutes(db: Db, config: BackupConfig) {
  return new Hono()
    .get('/backups', (c) => c.json(getBackupStatus(config)))
    .post('/backups', async (c) => {
      const info = await backupDatabase(db, config.dir, 'manual');
      pruneBackups(config.dir, config.keep);
      return c.json(info, 201);
    });
}
