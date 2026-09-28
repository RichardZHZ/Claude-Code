import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { logger } from 'hono/logger';
import { DomainError, isoWeekKey, pingDb, toDateString, type Db } from '@researchpilot/core';
import { inboxRoutes } from './routes/inbox.ts';
import { insightRoutes } from './routes/insights.ts';
import { planRoutes } from './routes/plans.ts';
import { projectRoutes } from './routes/projects.ts';
import { taskRoutes } from './routes/tasks.ts';
import { themeRoutes } from './routes/themes.ts';

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

  app.route('/', themeRoutes(db));
  app.route('/', projectRoutes(db));
  app.route('/', taskRoutes(db));
  app.route('/', planRoutes(db));
  app.route('/', inboxRoutes(db));
  app.route('/', insightRoutes(db, today));

  app.notFound((c) => c.json({ error: '未找到该接口' }, 404));
  app.onError((err, c) => {
    if (err instanceof DomainError) {
      return c.json({ error: err.message }, err.code === 'not_found' ? 404 : 400);
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
