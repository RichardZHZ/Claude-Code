import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  createZoteroClient,
  openDb,
  resolveDbPath,
  resolveZoteroUrl,
  runMigrations,
} from '@researchpilot/core';
import { createServer } from './server.ts';

// stdio 服务器：标准输出只能用来传协议消息，日志一律写到标准错误。
const dbPath = resolveDbPath();
const db = openDb(dbPath);
runMigrations(db);

const server = createServer({ db, zotero: createZoteroClient({ baseUrl: resolveZoteroUrl() }) });
await server.connect(new StdioServerTransport());
console.error(`科研小助理 MCP 服务器已启动，数据库：${dbPath}`);

function shutdown() {
  void server.close();
  db.$client.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
