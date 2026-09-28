#!/usr/bin/env node
// 启动科研小助理的 MCP 服务器（stdio）。
// 用 tsx 直接运行 TypeScript 源码，无需构建。任何工作目录下都能启动。
import { register } from 'tsx/esm/api';

register();
await import(new URL('../src/index.ts', import.meta.url).href);
