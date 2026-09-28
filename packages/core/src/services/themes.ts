import { asc, eq, sql } from 'drizzle-orm';
import type { CreateThemeInput, UpdateThemeInput } from '../contracts.ts';
import type { Conn } from '../db.ts';
import { notFound } from '../errors.ts';
import { themes, type NewTheme, type Theme } from '../schema.ts';

export function listThemes(db: Conn): Theme[] {
  return db
    .select()
    .from(themes)
    .orderBy(sql`case ${themes.status} when 'active' then 0 when 'dormant' then 1 else 2 end`, asc(themes.id))
    .all();
}

export function getTheme(db: Conn, id: number): Theme {
  const row = db.select().from(themes).where(eq(themes.id, id)).get();
  if (!row) throw notFound('议题', id);
  return row;
}

export function createTheme(db: Conn, input: CreateThemeInput): Theme {
  const values: NewTheme = {
    title: input.title,
    description: input.description ?? null,
    coreQuestions: input.coreQuestions ?? [],
    status: input.status ?? 'active',
    startedAt: input.startedAt ?? null,
    reviewCadenceDays: input.reviewCadenceDays ?? 30,
  };
  return db.insert(themes).values(values).returning().get();
}

export function updateTheme(db: Conn, id: number, patch: UpdateThemeInput): Theme {
  getTheme(db, id);
  const set: Partial<NewTheme> = {};
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.coreQuestions !== undefined) set.coreQuestions = patch.coreQuestions;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.startedAt !== undefined) set.startedAt = patch.startedAt;
  if (patch.reviewCadenceDays !== undefined) set.reviewCadenceDays = patch.reviewCadenceDays;
  if (Object.keys(set).length > 0) db.update(themes).set(set).where(eq(themes.id, id)).run();
  return getTheme(db, id);
}

/** 删除议题：其下课题保留但解除关联；直接挂在议题下的任务一并删除。 */
export function deleteTheme(db: Conn, id: number): void {
  const res = db.delete(themes).where(eq(themes.id, id)).run();
  if (res.changes === 0) throw notFound('议题', id);
}
