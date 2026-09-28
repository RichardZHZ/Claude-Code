// 正式运行入口（pnpm start、Docker）：一个端口同时提供页面和接口。
import { fileURLToPath } from 'node:url';
import { startServer } from './server.ts';
import { hasWebBuild } from './web.ts';

const webDist = process.env.WEB_DIST ?? fileURLToPath(new URL('../../web/dist', import.meta.url));
if (!hasWebBuild(webDist)) {
  console.error(`找不到前端构建产物：${webDist}。请先运行 pnpm build，或用 pnpm start（会自动构建）。`);
  process.exit(1);
}
await startServer({ webDist });
