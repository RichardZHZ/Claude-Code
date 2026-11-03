import { Hono } from 'hono';
import { z } from 'zod';
import {
  deleteFocusSession,
  getFocusState,
  getWeekRecap,
  pauseFocus,
  resumeFocus,
  startFocus,
  stopFocus,
  type Db,
} from '@researchpilot/core';
import { focusQuery, focusTargetInput, startFocusInput, weekKeyParam } from '@researchpilot/core/contracts';
import { idParam, validate } from '../validate.ts';

const weekParam = z.object({ weekKey: weekKeyParam });

/** 专心致志（正计时、倒计时）和回顾。 */
export function focusRoutes(db: Db, today: () => string, now: () => Date) {
  return new Hono()
    .get('/focus', validate('query', focusQuery), (c) =>
      c.json(getFocusState(db, c.req.valid('query').today ?? today(), now())),
    )
    .post('/focus/start', validate('json', startFocusInput), (c) =>
      c.json(startFocus(db, c.req.valid('json'), now()), 201),
    )
    .post('/focus/stop', validate('json', focusTargetInput), (c) =>
      c.json(stopFocus(db, c.req.valid('json'), now())),
    )
    .post('/focus/pause', validate('json', focusTargetInput), (c) =>
      c.json(pauseFocus(db, c.req.valid('json'), now())),
    )
    .post('/focus/resume', validate('json', focusTargetInput), (c) =>
      c.json(resumeFocus(db, c.req.valid('json'), now())),
    )
    .delete('/focus/sessions/:id', validate('param', idParam), (c) => {
      deleteFocusSession(db, c.req.valid('param').id, now());
      return c.body(null, 204);
    })
    .get('/recap/:weekKey', validate('param', weekParam), (c) =>
      c.json(getWeekRecap(db, c.req.valid('param').weekKey, now())),
    );
}
