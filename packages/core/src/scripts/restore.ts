// pnpm db:restore <备份文件>：用备份覆盖数据库。先停掉网页服务和 MCP 服务器再运行。
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { restoreDatabase } from '../backup.ts';
import { resolveBackupConfig, resolveDbPath } from '../config.ts';
import { DomainError } from '../errors.ts';

const arg = process.argv[2];
if (!arg) {
  console.error(
    '用法：pnpm db:restore <备份文件路径>。可以用 pnpm db:backup --list 查看已有备份，只写文件名即可。',
  );
  process.exit(1);
}
const path = resolveDbPath();
const backupDir = resolveBackupConfig(path).dir;
// 只写文件名时在备份目录里找；其他相对路径按仓库根目录解析（pnpm 会切到那里运行）。
const file = isAbsolute(arg)
  ? arg
  : existsSync(join(backupDir, arg))
    ? join(backupDir, arg)
    : resolve(process.env.INIT_CWD ?? process.cwd(), arg);

try {
  const safety = await restoreDatabase(file, path, backupDir);
  if (safety) console.log(`恢复前的数据库已另存为：${safety.path}`);
  console.log(`已用 ${file} 恢复数据库：${path}`);
} catch (err) {
  if (err instanceof DomainError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}
