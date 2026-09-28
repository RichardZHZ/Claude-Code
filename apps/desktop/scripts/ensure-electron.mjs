// pnpm 默认不运行依赖的安装脚本，所以 Electron 本体不会随 pnpm install 下载（省下约 100 MB）。
// 第一次用 pnpm desktop 时在这里补下载。
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const dir = dirname(require.resolve('electron/package.json'));
if (!existsSync(join(dir, 'path.txt'))) {
  console.log('第一次运行，正在下载 Electron…');
  execFileSync(process.execPath, [join(dir, 'install.js')], { stdio: 'inherit' });
}
