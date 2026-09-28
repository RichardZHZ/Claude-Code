import { Hono } from 'hono';
import { z } from 'zod';
import { getDayView, getWeekView, saveDayPlan, saveWeekPlan, type Db } from '@researchpilot/core';
import { dateParam, dayPlanInput, weekKeyParam, weekPlanInput } from '@researchpilot/core/contracts';
import { validate } from '../validate.ts';

const weekParam = z.object({ weekKey: weekKeyParam });
const dayParam = z.object({ date: dateParam });

/** 周计划与日计划。 */
export function planRoutes(db: Db) {
  return new Hono()
    .get('/weeks/:weekKey', validate('param', weekParam), (c) =>
      c.json(getWeekView(db, c.req.valid('param').weekKey)),
    )
    .put('/weeks/:weekKey/plan', validate('param', weekParam), validate('json', weekPlanInput), (c) =>
      c.json(saveWeekPlan(db, c.req.valid('param').weekKey, c.req.valid('json'))),
    )
    .get('/days/:date', validate('param', dayParam), (c) => c.json(getDayView(db, c.req.valid('param').date)))
    .put('/days/:date/plan', validate('param', dayParam), validate('json', dayPlanInput), (c) =>
      c.json(saveDayPlan(db, c.req.valid('param').date, c.req.valid('json'))),
    );
}
