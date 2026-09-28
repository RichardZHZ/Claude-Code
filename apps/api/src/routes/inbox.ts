import { Hono } from 'hono';
import { createInboxItem, deleteInboxItem, listInbox, promoteInboxItem, type Db } from '@researchpilot/core';
import { createInboxInput, promoteInboxInput } from '@researchpilot/core/contracts';
import { idParam, validate } from '../validate.ts';

/** 收件箱。 */
export function inboxRoutes(db: Db) {
  return new Hono()
    .get('/inbox', (c) => c.json(listInbox(db)))
    .post('/inbox', validate('json', createInboxInput), (c) =>
      c.json(createInboxItem(db, c.req.valid('json')), 201),
    )
    .delete('/inbox/:id', validate('param', idParam), (c) => {
      deleteInboxItem(db, c.req.valid('param').id);
      return c.body(null, 204);
    })
    .post('/inbox/:id/promote', validate('param', idParam), validate('json', promoteInboxInput), (c) =>
      c.json(promoteInboxItem(db, c.req.valid('param').id, c.req.valid('json')), 201),
    );
}
