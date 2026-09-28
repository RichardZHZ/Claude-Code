import { Hono } from 'hono';
import { exportCalendar, getHealthReport, listActivity, listReviews, type Db } from '@researchpilot/core';
import { activityQuery, checksQuery, reviewsQuery } from '@researchpilot/core/contracts';
import { validate } from '../validate.ts';

/** 健康检查、活动记录、复盘时间线和日历导出。 */
export function insightRoutes(db: Db, today: () => string) {
  return new Hono()
    .get('/checks', validate('query', checksQuery), (c) =>
      c.json(getHealthReport(db, c.req.valid('query').today ?? today())),
    )
    .get('/activity', validate('query', activityQuery), (c) => c.json(listActivity(db, c.req.valid('query'))))
    .get('/reviews', validate('query', reviewsQuery), (c) => c.json(listReviews(db, c.req.valid('query'))))
    .get('/calendar.ics', (c) => {
      c.header('Content-Type', 'text/calendar; charset=utf-8');
      c.header('Content-Disposition', 'inline; filename="researchpilot.ics"');
      c.header('Cache-Control', 'no-cache');
      return c.body(exportCalendar(db));
    });
}
