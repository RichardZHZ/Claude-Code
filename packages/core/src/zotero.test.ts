import { describe, expect, it } from 'vitest';
import { DomainError } from './errors.ts';
import { fakeZoteroFetch } from './testing/fake-zotero.ts';
import { createZoteroClient, formatCitation, parseZoteroItem } from './zotero.ts';

const client = (mode?: 'up' | 'down' | 'disabled') =>
  createZoteroClient({ baseUrl: 'http://127.0.0.1:23119', fetch: fakeZoteroFetch(undefined, mode) });

async function expectCode(p: Promise<unknown>, code: string, message?: RegExp) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(DomainError);
  expect((err as DomainError).code).toBe(code);
  if (message) expect((err as DomainError).message).toMatch(message);
}

describe('解析 Zotero 条目', () => {
  it('作者摘要、年份、出版物', () => {
    const item = parseZoteroItem({
      key: 'ABCD1234',
      data: {
        itemType: 'bookSection',
        title: '城市气候',
        date: 'March 2019',
        bookTitle: '城市环境手册',
        creators: [
          { creatorType: 'editor', lastName: '主编' },
          { creatorType: 'author', lastName: '张' },
          { creatorType: 'author', name: '某研究组' },
        ],
      },
    });
    expect(item).toMatchObject({ creators: '张 and 某研究组', year: '2019', publication: '城市环境手册' });
  });

  it('优先使用 meta 里的摘要', () => {
    const item = parseZoteroItem({
      key: 'ABCD1234',
      meta: { creatorSummary: 'Li et al.', parsedDate: '2015-06-01' },
      data: { itemType: 'journalArticle', title: 't' },
    });
    expect(item).toMatchObject({ creators: 'Li et al.', year: '2015' });
  });

  it('笔记和附件不算文献', () => {
    expect(parseZoteroItem({ key: 'ABCD1234', data: { itemType: 'note' } })).toBeNull();
  });

  it('引文格式', () => {
    expect(formatCitation({ creators: 'Oke', year: '1982', title: 'The energetic basis' })).toBe(
      'Oke (1982) The energetic basis',
    );
    expect(formatCitation({ creators: '', year: '', title: '无名' })).toBe('佚名 无名');
  });
});

describe('Zotero 客户端', () => {
  it('搜索：按标题或作者匹配，过滤掉笔记', async () => {
    const byAuthor = await client().search('oke');
    expect(byAuthor.map((i) => i.key)).toEqual(['OKE1982A']);
    expect(byAuthor[0]).toMatchObject({ creators: 'Oke', year: '1982' });
    const all = await client().search('热岛');
    expect(all.map((i) => i.key)).toEqual([]);
    const heat = await client().search('heat');
    expect(heat.map((i) => i.key).sort()).toEqual(['LIZHAO15', 'OKE1982A']);
  });

  it('空查询报 invalid', async () => {
    await expectCode(client().search('  '), 'invalid');
  });

  it('按 key 取条目；不存在时 not_found；格式不对时 invalid', async () => {
    expect((await client().getItem('LIZHAO15')).creators).toBe('Li et al.');
    await expectCode(client().getItem('ZZZZZZZZ'), 'not_found');
    await expectCode(client().getItem('bad'), 'invalid');
    await expectCode(client().getItem('NOTE0001'), 'invalid', /笔记或附件/);
  });

  it('最近加入的条目', async () => {
    const list = await client().recent(new Date('2026-09-28T00:00:00Z'));
    expect(list.map((i) => i.key)).toEqual(['LIZHAO15']);
  });

  it('Zotero 没运行或本地 API 未开启时给出设置提示', async () => {
    await expectCode(
      client('down').search('heat'),
      'unavailable',
      /连不上 Zotero.*允许此计算机上的其他应用程序/,
    );
    await expectCode(client('disabled').search('heat'), 'unavailable', /本地 API 没有开启/);
    expect(await client('down').status()).toMatchObject({ available: false });
    expect(await client().status()).toEqual({ available: true, message: 'Zotero 已连接' });
  });
});
