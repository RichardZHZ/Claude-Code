import { Hono } from 'hono';
import { z } from 'zod';
import {
  getDayView,
  getWeekView,
  saveDayPlan,
  saveDayReview,
  saveWeekPlan,
  saveWeekReview,
  type Db,
} from '@researchpilot/core';
import {
  dateParam,
  dayPlanInput,
  dayReviewInput,
  weekKeyParam,
  weekPlanInput,
  weekReviewInput,
} from '@researchpilot/core/contracts';
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
    .put('/weeks/:weekKey/review', validate('param', weekParam), validate('json', weekReviewInput), (c) =>
      c.json(saveWeekReview(db, c.req.valid('param').weekKey, c.req.valid('json'))),
    )
    .get('/days/:date', validate('param', dayParam), (c) => c.json(getDayView(db, c.req.valid('param').date)))
    .put('/days/:date/plan', validate('param', dayParam), validate('json', dayPlanInput), (c) =>
      c.json(saveDayPlan(db, c.req.valid('param').date, c.req.valid('json'))),
    )
    .put('/days/:date/review', validate('param', dayParam), validate('json', dayReviewInput), (c) =>
      c.json(saveDayReview(db, c.req.valid('param').date, c.req.valid('json'))),
    );
}
