import { Hono } from 'hono';
import { z } from 'zod';
import {
  createMilestone,
  createProject,
  deleteMilestone,
  deleteProject,
  getProjectDetail,
  listProjects,
  updateMilestone,
  updateProject,
  type Db,
} from '@researchpilot/core';
import {
  createMilestoneInput,
  createProjectInput,
  updateMilestoneInput,
  updateProjectInput,
} from '@researchpilot/core/contracts';
import { idParam, validate } from '../validate.ts';

const projectQuery = z.object({ themeId: z.coerce.number().int().positive().optional() });

/** 课题与里程碑。 */
export function projectRoutes(db: Db) {
  return new Hono()
    .get('/projects', validate('query', projectQuery), (c) => c.json(listProjects(db, c.req.valid('query'))))
    .post('/projects', validate('json', createProjectInput), (c) =>
      c.json(createProject(db, c.req.valid('json')), 201),
    )
    .get('/projects/:id', validate('param', idParam), (c) =>
      c.json(getProjectDetail(db, c.req.valid('param').id)),
    )
    .patch('/projects/:id', validate('param', idParam), validate('json', updateProjectInput), (c) =>
      c.json(updateProject(db, c.req.valid('param').id, c.req.valid('json'))),
    )
    .delete('/projects/:id', validate('param', idParam), (c) => {
      deleteProject(db, c.req.valid('param').id);
      return c.body(null, 204);
    })
    .post(
      '/projects/:id/milestones',
      validate('param', idParam),
      validate('json', createMilestoneInput),
      (c) => c.json(createMilestone(db, c.req.valid('param').id, c.req.valid('json')), 201),
    )
    .patch('/milestones/:id', validate('param', idParam), validate('json', updateMilestoneInput), (c) =>
      c.json(updateMilestone(db, c.req.valid('param').id, c.req.valid('json'))),
    )
    .delete('/milestones/:id', validate('param', idParam), (c) => {
      deleteMilestone(db, c.req.valid('param').id);
      return c.body(null, 204);
    });
}
