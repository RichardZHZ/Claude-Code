import { fileURLToPath } from 'node:url';

/** 默认数据库位置：仓库根目录下的 data/researchpilot.db。可用环境变量 DB_PATH 覆盖。 */
export const DEFAULT_DB_PATH = fileURLToPath(new URL('../../../data/researchpilot.db', import.meta.url));

export function resolveDbPath(): string {
  return process.env.DB_PATH ?? DEFAULT_DB_PATH;
}

/** Zotero 本地 API 的地址。Zotero 7 默认监听 23119 端口，可用环境变量 ZOTERO_URL 覆盖。 */
export const DEFAULT_ZOTERO_URL = 'http://127.0.0.1:23119';

export function resolveZoteroUrl(): string {
  return process.env.ZOTERO_URL ?? DEFAULT_ZOTERO_URL;
}
