// 测试用的假 Zotero：按 Zotero 本地 API 的返回格式回应请求。

export type FakeZoteroItem = {
  key: string;
  itemType?: string;
  title: string;
  creators?: { creatorType?: string; firstName?: string; lastName?: string; name?: string }[];
  date?: string;
  publicationTitle?: string;
  DOI?: string;
  url?: string;
  dateAdded?: string;
};

export const SAMPLE_ZOTERO_ITEMS: FakeZoteroItem[] = [
  {
    key: 'OKE1982A',
    itemType: 'journalArticle',
    title: 'The energetic basis of the urban heat island',
    creators: [{ creatorType: 'author', firstName: 'T. R.', lastName: 'Oke' }],
    date: '1982',
    publicationTitle: 'Quarterly Journal of the Royal Meteorological Society',
    DOI: '10.1002/qj.49710845502',
    dateAdded: '2026-09-20T08:00:00Z',
  },
  {
    key: 'LIZHAO15',
    itemType: 'journalArticle',
    title: 'Urban heat islands and summertime mortality',
    creators: [
      { creatorType: 'author', lastName: 'Li' },
      { creatorType: 'author', lastName: 'Zhao' },
      { creatorType: 'author', lastName: 'Wang' },
    ],
    date: '2015-06',
    publicationTitle: 'Environmental Research Letters',
    dateAdded: '2026-09-29T02:00:00Z',
  },
  {
    key: 'NOTE0001',
    itemType: 'note',
    title: '读书笔记：热岛',
    dateAdded: '2026-09-29T03:00:00Z',
  },
];

function toApi(item: FakeZoteroItem) {
  const { key, ...data } = item;
  return { key, version: 1, data: { key, itemType: 'journalArticle', ...data } };
}

/**
 * 返回一个模拟 Zotero 本地 API 的 fetch。
 * mode 为 'down' 时模拟 Zotero 没运行，'disabled' 时模拟本地 API 未开启。
 */
export function fakeZoteroFetch(
  items: FakeZoteroItem[] = SAMPLE_ZOTERO_ITEMS,
  mode: 'up' | 'down' | 'disabled' = 'up',
): typeof fetch {
  return (async (input: string | URL | Request) => {
    if (mode === 'down') throw new TypeError('fetch failed');
    if (mode === 'disabled') return new Response('Local API is not enabled', { status: 403 });
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const itemMatch = /\/api\/users\/0\/items\/([A-Z0-9]{8})$/.exec(url.pathname);
    if (itemMatch) {
      const item = items.find((i) => i.key === itemMatch[1]);
      return item ? Response.json(toApi(item)) : new Response('Not found', { status: 404 });
    }
    if (url.pathname.endsWith('/api/users/0/items/top')) {
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      let list = items.filter(
        (i) =>
          !q ||
          i.title.toLowerCase().includes(q) ||
          (i.creators ?? []).some((c) => (c.lastName ?? c.name ?? '').toLowerCase().includes(q)),
      );
      if (url.searchParams.get('sort') === 'dateAdded') {
        list = [...list].sort((a, b) => (b.dateAdded ?? '').localeCompare(a.dateAdded ?? ''));
      }
      const limit = Number(url.searchParams.get('limit') ?? 25);
      return Response.json(list.slice(0, limit).map(toApi), {
        headers: { 'Total-Results': String(list.length) },
      });
    }
    return new Response('Not found', { status: 404 });
  }) as typeof fetch;
}
