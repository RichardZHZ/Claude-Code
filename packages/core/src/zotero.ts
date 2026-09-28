// Zotero 7 本地 API 客户端（只读）。
// 本地 API 与官方 Web API v3 格式相同，地址为 http://127.0.0.1:23119/api/，用户编号固定为 0。
// 需要在 Zotero 的"设置 → 高级 → 其他"里勾选"允许此计算机上的其他应用程序与 Zotero 通信"。

import { invalid, notFound, unavailable } from './errors.ts';
import type { ResourceMeta } from './schema.ts';

export type ZoteroItem = {
  key: string;
  title: string;
  /** 作者摘要，例如 "Oke"、"Smith and Jones"、"Li et al."。 */
  creators: string;
  year: string;
  itemType: string;
  publication: string;
  doi: string;
  url: string;
  /** ISO 时间，条目加入 Zotero 的时刻。 */
  dateAdded: string;
};

export type ZoteroStatus = { available: boolean; message: string };

export type ZoteroClient = {
  status(): Promise<ZoteroStatus>;
  search(query: string, limit?: number): Promise<ZoteroItem[]>;
  getItem(key: string): Promise<ZoteroItem>;
  /** 某个时刻之后加入 Zotero 的条目，按加入时间倒序。 */
  recent(since: Date, limit?: number): Promise<ZoteroItem[]>;
};

export type ZoteroClientOptions = {
  baseUrl: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

const SETUP_HINT =
  '请确认 Zotero 7 正在运行，并在"设置 → 高级 → 其他"里勾选"允许此计算机上的其他应用程序与 Zotero 通信"。';

/** Zotero 条目 key：8 位大写字母或数字。 */
export const ZOTERO_KEY_RE = /^[A-Z0-9]{8}$/;

// ---------- 解析 ----------

type RawCreator = { creatorType?: string; firstName?: string; lastName?: string; name?: string };
type RawItem = {
  key?: string;
  meta?: { creatorSummary?: string; parsedDate?: string };
  data?: Record<string, unknown> & { creators?: RawCreator[] };
};

const str = (v: unknown) => (typeof v === 'string' ? v : '');

function creatorSummary(creators: RawCreator[] | undefined): string {
  const names = (creators ?? [])
    .filter((c) => !c.creatorType || c.creatorType === 'author')
    .map((c) => c.lastName || c.name || '')
    .filter(Boolean);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} et al.`;
}

/** 笔记和附件不是文献，不参与搜索和关联。 */
const NON_BIBLIOGRAPHIC = new Set(['note', 'attachment', 'annotation']);

export function parseZoteroItem(raw: RawItem): ZoteroItem | null {
  const d = raw.data ?? {};
  const itemType = str(d.itemType);
  const key = str(raw.key) || str(d.key);
  if (!key || NON_BIBLIOGRAPHIC.has(itemType)) return null;
  const year = (raw.meta?.parsedDate ?? '').slice(0, 4) || (/\d{4}/.exec(str(d.date))?.[0] ?? '');
  return {
    key,
    title: str(d.title) || '（无标题）',
    creators: raw.meta?.creatorSummary || creatorSummary(d.creators),
    year,
    itemType,
    publication:
      str(d.publicationTitle) ||
      str(d.bookTitle) ||
      str(d.proceedingsTitle) ||
      str(d.university) ||
      str(d.publisher),
    doi: str(d.DOI),
    url: str(d.url),
    dateAdded: str(d.dateAdded),
  };
}

/** 简短引文，例如 "Oke (1982) The energetic basis of the urban heat island"。 */
export function formatCitation(item: Pick<ZoteroItem, 'creators' | 'year' | 'title'>): string {
  const who = item.creators || '佚名';
  return item.year ? `${who} (${item.year}) ${item.title}` : `${who} ${item.title}`;
}

export function zoteroMeta(item: ZoteroItem): ResourceMeta {
  return {
    title: item.title,
    creators: item.creators,
    year: item.year,
    itemType: item.itemType,
    publication: item.publication,
    doi: item.doi,
    url: item.url,
  };
}

// ---------- 客户端 ----------

export function createZoteroClient({
  baseUrl,
  fetch: fetchImpl = fetch,
  timeoutMs = 5000,
}: ZoteroClientOptions): ZoteroClient {
  const root = baseUrl.replace(/\/+$/, '');

  async function request(path: string, params: Record<string, string> = {}): Promise<Response> {
    const url = new URL(`${root}/api${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    let res: Response;
    try {
      res = await fetchImpl(url, {
        headers: { 'Zotero-API-Version': '3', Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw unavailable(`连不上 Zotero（${root}）。${SETUP_HINT}`);
    }
    if (res.status === 403) throw unavailable(`Zotero 的本地 API 没有开启。${SETUP_HINT}`);
    return res;
  }

  async function items(path: string, params: Record<string, string>): Promise<ZoteroItem[]> {
    const res = await request(path, { format: 'json', ...params });
    if (!res.ok) throw unavailable(`Zotero 返回错误（${res.status}）。`);
    const body = (await res.json()) as RawItem[];
    return body.map(parseZoteroItem).filter((i): i is ZoteroItem => i !== null);
  }

  return {
    async status() {
      try {
        const res = await request('/users/0/items/top', { format: 'json', limit: '1' });
        if (!res.ok) return { available: false, message: `Zotero 返回错误（${res.status}）。` };
        return { available: true, message: 'Zotero 已连接' };
      } catch (err) {
        return { available: false, message: err instanceof Error ? err.message : String(err) };
      }
    },

    async search(query, limit = 10) {
      const q = query.trim();
      if (!q) throw invalid('请输入要搜索的内容');
      // 多取一些，过滤掉笔记和附件后再截断。
      const list = await items('/users/0/items/top', {
        q,
        qmode: 'titleCreatorYear',
        sort: 'dateModified',
        direction: 'desc',
        limit: String(Math.min(limit * 2, 100)),
      });
      return list.slice(0, limit);
    },

    async getItem(key) {
      if (!ZOTERO_KEY_RE.test(key)) throw invalid(`Zotero 条目 key 格式不对：${key}`);
      const res = await request(`/users/0/items/${key}`, { format: 'json' });
      if (res.status === 404) throw notFound('Zotero 条目', key);
      if (!res.ok) throw unavailable(`Zotero 返回错误（${res.status}）。`);
      const item = parseZoteroItem((await res.json()) as RawItem);
      if (!item) throw invalid('这个条目是笔记或附件，不能作为文献关联');
      return item;
    },

    async recent(since, limit = 50) {
      const list = await items('/users/0/items/top', {
        sort: 'dateAdded',
        direction: 'desc',
        limit: String(Math.min(limit, 100)),
      });
      return list.filter((i) => i.dateAdded && new Date(i.dateAdded).getTime() >= since.getTime());
    },
  };
}
