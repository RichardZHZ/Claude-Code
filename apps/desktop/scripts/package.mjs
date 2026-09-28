// 打包桌面应用：node scripts/package.mjs --mac [--arch arm64,x64]，或 --linux。
// 1. 构建网页，打包主进程、服务和 MCP 服务器；
// 2. 把应用内容整理到 .stage/，用 npm 装上 better-sqlite3；
// 3. 交给 electron-builder 生成安装包。
// better-sqlite3 自带各平台的 N-API 预编译文件（包括 Apple 芯片和 Intel 的 Mac），
// N-API 与 Node 版本无关，Electron 可以直接加载，不需要为 Electron 重新编译。
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = fileURLToPath(new URL('..', import.meta.url));
const repo = join(desktop, '..', '..');
const stage = join(desktop, '.stage');

const args = process.argv.slice(2);
const platform = args.includes('--linux') ? 'linux' : args.includes('--win') ? 'win' : 'mac';
const archArg = args[args.indexOf('--arch') + 1];
const arches = args.includes('--arch') && archArg ? archArg.split(',') : [process.arch];

const run = (cmd, cmdArgs, cwd = desktop) => execFileSync(cmd, cmdArgs, { cwd, stdio: 'inherit' });
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

run('pnpm', ['--filter', '@researchpilot/web', 'build'], repo);
run(process.execPath, ['scripts/bundle.mjs']);

const pkg = readJson(join(desktop, 'package.json'));
const sqliteVersion = readJson(
  createRequire(join(desktop, 'package.json')).resolve('better-sqlite3/package.json'),
).version;

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(join(desktop, 'dist'), join(stage, 'dist'), { recursive: true });
cpSync(join(repo, 'packages', 'core', 'drizzle'), join(stage, 'drizzle'), { recursive: true });
cpSync(join(repo, 'apps', 'web', 'dist'), join(stage, 'web'), { recursive: true });
writeFileSync(
  join(stage, 'package.json'),
  JSON.stringify(
    {
      name: 'researchpilot',
      productName: '科研小助理',
      version: pkg.version,
      description: pkg.description,
      author: 'ResearchPilot',
      main: 'dist/main.cjs',
      dependencies: { 'better-sqlite3': sqliteVersion },
    },
    null,
    2,
  ),
);
// 用 npm 而不是 pnpm：得到普通的 node_modules 目录，electron-builder 可以直接复制。
// --ignore-scripts：不在本机编译原生模块，只用包里自带的预编译文件。
run(
  'npm',
  ['install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock'],
  stage,
);

run(join(desktop, 'node_modules', '.bin', 'electron-builder'), [
  `--${platform}`,
  ...arches.map((arch) => `--${arch}`),
  '--config',
  'builder.config.cjs',
  '--publish',
  'never',
]);
console.log(`\n安装包在 ${join(desktop, 'release')}`);
