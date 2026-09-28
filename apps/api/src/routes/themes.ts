import { Hono } from 'hono';
import {
  createTheme,
  deleteTheme,
  getTheme,
  getThemeMap,
  listCountdowns,
  listOwners,
  listThemes,
  updateTheme,
  type Db,
} from '@researchpilot/core';
import { createThemeInput, updateThemeInput } from '@researchpilot/core/contracts';
import { idParam, validate } from '../validate.ts';

/** 议题（含倒计时），以及议题地图和任务归属选项。 */
export function themeRoutes(db: Db) {
  return new Hono()
    .get('/map', (c) => c.json(getThemeMap(db)))
    .get('/owners', (c) => c.json(listOwners(db)))
    .get('/themes', (c) => c.json(listThemes(db)))
    .get('/countdowns', (c) => c.json(listCountdowns(db)))
    .post('/themes', validate('json', createThemeInput), (c) =>
      c.json(createTheme(db, c.req.valid('json')), 201),
    )
    .get('/themes/:id', validate('param', idParam), (c) => c.json(getTheme(db, c.req.valid('param').id)))
    .patch('/themes/:id', validate('param', idParam), validate('json', updateThemeInput), (c) =>
      c.json(updateTheme(db, c.req.valid('param').id, c.req.valid('json'))),
    )
    .delete('/themes/:id', validate('param', idParam), (c) => {
      deleteTheme(db, c.req.valid('param').id);
      return c.body(null, 204);
    });
}
