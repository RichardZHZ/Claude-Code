import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  createZoteroClient,
  migrateWithBackup,
  openDb,
  resolveBackupConfig,
  resolveDbPath,
  resolveZoteroUrl,
  startBackupScheduler,
} from '@researchpilot/core';
import { createServer } from './server.ts';

// stdio 服务器：标准输出只能用来传协议消息，日志一律写到标准错误。
const log = (message: string) => console.error(message);
const dbPath = resolveDbPath();
const backup = resolveBackupConfig(dbPath);
const db = openDb(dbPath);
const preMigration = await migrateWithBackup(db, backup.dir);
if (preMigration) log(`升级表结构前已备份：${preMigration.path}`);
// 只用 Claude、不开网页的时候也能按时备份。
const scheduler = startBackupScheduler(db, backup, log);

const server = createServer({ db, zotero: createZoteroClient({ baseUrl: resolveZoteroUrl() }) });
await server.connect(new StdioServerTransport());
log(`科研小助理 MCP 服务器已启动，数据库：${dbPath}`);

function shutdown() {
  scheduler.stop();
  void server.close();
  db.$client.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
