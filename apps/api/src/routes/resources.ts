import { Hono } from 'hono';
import {
  addResource,
  deleteResource,
  linkZoteroItem,
  listResources,
  type Db,
  type ZoteroClient,
} from '@researchpilot/core';
import {
  addResourceInput,
  linkZoteroInput,
  resourceQuery,
  zoteroSearchQuery,
} from '@researchpilot/core/contracts';
import { idParam, validate } from '../validate.ts';

/** 文献与链接，以及 Zotero 本地 API 的代理（浏览器不能直接访问 Zotero）。 */
export function resourceRoutes(db: Db, zotero: ZoteroClient) {
  return new Hono()
    .get('/resources', validate('query', resourceQuery), (c) =>
      c.json(listResources(db, c.req.valid('query'))),
    )
    .post('/resources', validate('json', addResourceInput), (c) =>
      c.json(addResource(db, c.req.valid('json')), 201),
    )
    .post('/resources/zotero', validate('json', linkZoteroInput), async (c) => {
      const { itemKey, ...owner } = c.req.valid('json');
      return c.json(await linkZoteroItem(db, zotero, owner, itemKey), 201);
    })
    .delete('/resources/:id', validate('param', idParam), (c) => {
      deleteResource(db, c.req.valid('param').id);
      return c.body(null, 204);
    })
    .get('/zotero/status', async (c) => c.json(await zotero.status()))
    .get('/zotero/search', validate('query', zoteroSearchQuery), async (c) => {
      const { q, limit } = c.req.valid('query');
      return c.json(await zotero.search(q, limit ?? 10));
    });
}
