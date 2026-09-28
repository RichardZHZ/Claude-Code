import { serve } from '@hono/node-server';
import { openDb, resolveDbPath, runMigrations } from '@researchpilot/core';
import { createApp } from './app.ts';

const dbPath = resolveDbPath();
const db = openDb(dbPath);
runMigrations(db);

const port = Number(process.env.PORT ?? 8787);
// 只监听本机：这是单用户的本地应用，不对局域网开放。
const hostname = process.env.HOST ?? '127.0.0.1';

const server = serve({ fetch: createApp({ db, log: true }).fetch, port, hostname }, (info) => {
  console.log(`API 已启动：http://${hostname}:${info.port}/api/health`);
  console.log(`数据库：${dbPath}`);
});

function shutdown() {
  server.close();
  db.$client.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
