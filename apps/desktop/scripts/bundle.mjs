// 把主进程、服务和 MCP 服务器各打包成一个文件，放在 dist/。
// better-sqlite3 是原生模块，不打包，打包桌面应用时按 Electron 的版本单独编译。
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const common = {
  absWorkingDir: root,
  bundle: true,
  platform: 'node',
  target: 'node22',
  logLevel: 'warning',
  legalComments: 'none',
};
// 打包进 ESM 的 CommonJS 依赖会用到 require、__dirname。
const esmBanner = [
  "import { createRequire as __rpCreateRequire } from 'node:module';",
  "import { fileURLToPath as __rpFileURLToPath } from 'node:url';",
  "import { dirname as __rpDirname } from 'node:path';",
  'const require = __rpCreateRequire(import.meta.url);',
  'const __filename = __rpFileURLToPath(import.meta.url);',
  'const __dirname = __rpDirname(__filename);',
].join('\n');

await Promise.all([
  build({
    ...common,
    entryPoints: ['src/main.ts'],
    outfile: 'dist/main.cjs',
    format: 'cjs',
    external: ['electron'],
  }),
  build({
    ...common,
    entryPoints: ['../api/src/serve.ts'],
    outfile: 'dist/server.mjs',
    format: 'esm',
    external: ['better-sqlite3'],
    banner: { js: esmBanner },
  }),
  build({
    ...common,
    entryPoints: ['../mcp/src/index.ts'],
    outfile: 'dist/mcp.mjs',
    format: 'esm',
    external: ['better-sqlite3'],
    banner: { js: esmBanner },
  }),
]);
console.log('已打包到 apps/desktop/dist/');
