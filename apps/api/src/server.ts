import { serve } from '@hono/node-server';
import {
  migrateWithBackup,
  openDb,
  resolveBackupConfig,
  resolveDbPath,
  startBackupScheduler,
} from '@researchpilot/core';
import { createApp } from './app.ts';
import { withWeb } from './web.ts';

export type ServerOptions = {
  /** 同时托管的前端构建目录；不传则只提供 /api（开发时前端由 Vite 提供）。 */
  webDist?: string;
};

/** 打开数据库（必要时先备份再升级）、启动定时备份和 HTTP 服务。 */
export async function startServer({ webDist }: ServerOptions = {}) {
  const dbPath = resolveDbPath();
  const backup = resolveBackupConfig(dbPath);
  const db = openDb(dbPath);
  const preMigration = await migrateWithBackup(db, backup.dir);
  if (preMigration) console.log(`升级表结构前已备份：${preMigration.path}`);

  // 桌面应用把输出写进日志文件，设 LOG_REQUESTS=off 不逐条记录请求。
  const api = createApp({ db, backup, log: process.env.LOG_REQUESTS !== 'off' });
  const app = webDist ? withWeb(api, webDist) : api;
  const scheduler = startBackupScheduler(db, backup, (m) => console.log(m));

  const port = Number(process.env.PORT ?? 8787);
  // 默认只监听本机：这是单用户的本地应用，不对局域网开放。Docker 里需要设 HOST=0.0.0.0。
  const hostname = process.env.HOST ?? '127.0.0.1';
  const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
    const shown = hostname === '0.0.0.0' ? 'localhost' : hostname;
    if (webDist) console.log(`科研小助理已启动：http://${shown}:${info.port}`);
    else console.log(`API 已启动：http://${shown}:${info.port}/api/health`);
    console.log(`数据库：${dbPath}`);
    console.log(
      backup.auto
        ? `自动备份：每 ${backup.intervalHours} 小时一次，保留 ${backup.keep} 份，目录 ${backup.dir}`
        : '自动备份已关闭（AUTO_BACKUP=off）',
    );
  });

  function shutdown() {
    scheduler.stop();
    server.close();
    db.$client.close();
    process.exit(0);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
