// 开发入口（pnpm dev）：只提供 /api，页面由 Vite 开发服务器提供。
import { startServer } from './server.ts';

await startServer();
