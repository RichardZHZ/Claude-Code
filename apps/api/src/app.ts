import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import {
  createZoteroClient,
  DomainError,
  isoWeekKey,
  pingDb,
  resolveBackupConfig,
  resolveZoteroUrl,
  toDateString,
  type BackupConfig,
  type Db,
  type ZoteroClient,
} from '@researchpilot/core';
import { backupRoutes } from './routes/backups.ts';
import { inboxRoutes } from './routes/inbox.ts';
import { insightRoutes } from './routes/insights.ts';
import { planRoutes } from './routes/plans.ts';
import { projectRoutes } from './routes/projects.ts';
import { resourceRoutes } from './routes/resources.ts';
import { taskRoutes } from './routes/tasks.ts';
import { themeRoutes } from './routes/themes.ts';

export type AppOptions = {
  db: Db;
  /** 注入"今天"便于测试，默认取系统当天。 */
  today?: () => string;
  /** Zotero 本地 API 客户端，默认按环境变量 ZOTERO_URL 创建。 */
  zotero?: ZoteroClient;
  /** 备份设置，默认按环境变量解析。 */
  backup?: BackupConfig;
  log?: boolean;
};

/** 创建 API 应用。所有路由都挂在 /api 下，前端开发服务器会把 /api 代理到这里。 */
export function createApp({
  db,
  today = () => toDateString(new Date()),
  zotero = createZoteroClient({ baseUrl: resolveZoteroUrl() }),
  backup = resolveBackupConfig(),
  log = false,
}: AppOptions) {
  const app = new Hono().basePath('/api');
  if (log) app.use(logger());

  app.get('/health', (c) => {
    const date = today();
    return c.json({
      ok: pingDb(db),
      today: date,
      week: isoWeekKey(date),
    });
  });

  app.route('/', themeRoutes(db));
  app.route('/', projectRoutes(db));
  app.route('/', taskRoutes(db));
  app.route('/', planRoutes(db));
  app.route('/', inboxRoutes(db));
  app.route('/', insightRoutes(db, today));
  app.route('/', resourceRoutes(db, zotero));
  app.route('/', backupRoutes(db, backup));

  app.notFound((c) => c.json({ error: '未找到该接口' }, 404));
  app.onError((err, c) => {
    if (err instanceof DomainError) {
      const status = err.code === 'not_found' ? 404 : err.code === 'unavailable' ? 503 : 400;
      return c.json({ error: err.message }, status);
    }
    if (err instanceof HTTPException) {
      const message = err.status === 400 ? '请求内容不是合法的 JSON' : err.message || '请求有误';
      return c.json({ error: message }, err.status);
    }
    console.error(err);
    return c.json({ error: '服务器内部错误' }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
