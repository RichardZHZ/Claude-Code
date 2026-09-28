import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { App } from './app.ts';

/** 前端构建产物是否存在。 */
export function hasWebBuild(distDir: string): boolean {
  return existsSync(join(distDir, 'index.html'));
}

/**
 * 在 API 之外托管前端构建产物（apps/web/dist），一个端口同时提供页面和接口。
 * 前端是单页应用：不带扩展名的页面路径（如 /week）一律返回 index.html，交给前端路由。
 */
export function withWeb(api: App, distDir: string) {
  const indexHtml = () =>
    new Response(readFileSync(join(distDir, 'index.html')), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' },
    });

  const app = new Hono();
  app.route('/', api);
  app.get('/', indexHtml);
  // 带哈希的文件名，内容变了文件名就会变，可以长期缓存。
  app.use('/assets/*', async (c, next) => {
    await next();
    if (c.res.ok) c.header('Cache-Control', 'public, max-age=31536000, immutable');
  });
  app.use('*', serveStatic({ root: distDir }));
  app.notFound((c) => {
    const path = c.req.path;
    if (path === '/api' || path.startsWith('/api/')) return c.json({ error: '未找到该接口' }, 404);
    const isPage = (c.req.method === 'GET' || c.req.method === 'HEAD') && !/\.[a-z0-9]+$/i.test(path);
    return isPage ? indexHtml() : c.text('Not Found', 404);
  });
  return app;
}
