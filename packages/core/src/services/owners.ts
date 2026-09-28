import { asc, ne, notInArray } from 'drizzle-orm';
import type { Conn } from '../db.ts';
import { CLOSED_PROJECT_STATUSES } from '../enums.ts';
import { projects, themes } from '../schema.ts';
import type { OwnerOptions } from '../types.ts';
import { projectOrder } from './projects.ts';

/** 新建任务时可选的归属：未结束的议题和未结束的课题。 */
export function listOwners(db: Conn): OwnerOptions {
  return {
    themes: db
      .select({ id: themes.id, title: themes.title })
      .from(themes)
      .where(ne(themes.status, 'closed'))
      .orderBy(asc(themes.id))
      .all(),
    projects: db
      .select({ id: projects.id, title: projects.title, themeId: projects.themeId })
      .from(projects)
      .where(notInArray(projects.status, [...CLOSED_PROJECT_STATUSES]))
      .orderBy(...projectOrder)
      .all(),
  };
}
