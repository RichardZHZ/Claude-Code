import { and, asc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import type { CreateThemeInput, UpdateThemeInput } from '../contracts.ts';
import type { Conn } from '../db.ts';
import { notFound } from '../errors.ts';
import { themes, type NewTheme, type Theme } from '../schema.ts';
import type { Countdown } from '../types.ts';
import { diffFields, logActivity } from './activity.ts';
import { pruneOrphanResources } from './resources.ts';

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
    countdownAt: input.countdownAt ?? null,
  };
  const theme = db.insert(themes).values(values).returning().get();
  logActivity(db, {
    entityType: 'theme',
    entityId: theme.id,
    action: 'created',
    themeId: theme.id,
    payload: { title: theme.title },
  });
  return theme;
}

export function updateTheme(db: Conn, id: number, patch: UpdateThemeInput): Theme {
  const existing = getTheme(db, id);
  const set: Partial<NewTheme> = {};
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.coreQuestions !== undefined) set.coreQuestions = patch.coreQuestions;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.startedAt !== undefined) set.startedAt = patch.startedAt;
  if (patch.reviewCadenceDays !== undefined) set.reviewCadenceDays = patch.reviewCadenceDays;
  if (patch.countdownAt !== undefined) set.countdownAt = patch.countdownAt;
  const changes = diffFields(existing, set);
  if (Object.keys(changes).length === 0) return existing;
  db.update(themes).set(set).where(eq(themes.id, id)).run();
  const theme = getTheme(db, id);
  logActivity(db, {
    entityType: 'theme',
    entityId: id,
    action: changes.status && Object.keys(changes).length === 1 ? 'status_changed' : 'updated',
    themeId: id,
    payload: { title: theme.title, changes },
  });
  return theme;
}

/** 设了倒计时、且没有结束的议题，截止时刻早的在前（已过期的排在最前）。 */
export function listCountdowns(db: Conn): Countdown[] {
  return db
    .select({ themeId: themes.id, title: themes.title, status: themes.status, at: themes.countdownAt })
    .from(themes)
    .where(and(isNotNull(themes.countdownAt), ne(themes.status, 'closed')))
    .orderBy(asc(themes.countdownAt), asc(themes.id))
    .all()
    .map((r) => ({ ...r, at: r.at! }));
}

/** 删除议题：其下课题保留但解除关联；直接挂在议题下的任务一并删除。 */
export function deleteTheme(db: Conn, id: number): void {
  const theme = getTheme(db, id);
  db.delete(themes).where(eq(themes.id, id)).run();
  pruneOrphanResources(db);
  logActivity(db, {
    entityType: 'theme',
    entityId: id,
    action: 'deleted',
    themeId: id,
    payload: { title: theme.title },
  });
}
