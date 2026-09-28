import { fileURLToPath } from 'node:url';

/** 默认数据库位置：仓库根目录下的 data/researchpilot.db。可用环境变量 DB_PATH 覆盖。 */
export const DEFAULT_DB_PATH = fileURLToPath(new URL('../../../data/researchpilot.db', import.meta.url));

export function resolveDbPath(): string {
  return process.env.DB_PATH ?? DEFAULT_DB_PATH;
}
