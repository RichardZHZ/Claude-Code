import { Hono } from 'hono';
import { createTask, deleteTask, getTaskView, listTasks, updateTask, type Db } from '@researchpilot/core';
import { createTaskInput, taskQuery, updateTaskInput } from '@researchpilot/core/contracts';
import { idParam, validate } from '../validate.ts';

/** 任务。 */
export function taskRoutes(db: Db) {
  return new Hono()
    .get('/tasks', validate('query', taskQuery), (c) => c.json(listTasks(db, c.req.valid('query'))))
    .post('/tasks', validate('json', createTaskInput), (c) =>
      c.json(createTask(db, c.req.valid('json')), 201),
    )
    .get('/tasks/:id', validate('param', idParam), (c) => c.json(getTaskView(db, c.req.valid('param').id)))
    .patch('/tasks/:id', validate('param', idParam), validate('json', updateTaskInput), (c) =>
      c.json(updateTask(db, c.req.valid('param').id, c.req.valid('json'))),
    )
    .delete('/tasks/:id', validate('param', idParam), (c) => {
      deleteTask(db, c.req.valid('param').id);
      return c.body(null, 204);
    });
}
