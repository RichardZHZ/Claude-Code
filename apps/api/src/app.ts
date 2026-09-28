import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { isoWeekKey, pingDb, toDateString, type Db } from '@researchpilot/core';

export type AppOptions = {
  db: Db;
  /** 注入"今天"便于测试，默认取系统当天。 */
  today?: () => string;
  log?: boolean;
};

/** 创建 API 应用。所有路由都挂在 /api 下，前端开发服务器会把 /api 代理到这里。 */
export function createApp({ db, today = () => toDateString(new Date()), log = false }: AppOptions) {
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

  app.notFound((c) => c.json({ error: '未找到该接口' }, 404));
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: '服务器内部错误' }, 500);
  });

  return app;
}

export type App = ReturnType<typeof createApp>;
