import { eq, max } from 'drizzle-orm';
import type { CreateMilestoneInput, UpdateMilestoneInput } from '../contracts.ts';
import type { Conn } from '../db.ts';
import type { ActivityAction } from '../enums.ts';
import { notFound } from '../errors.ts';
import { milestones, type Milestone, type NewMilestone } from '../schema.ts';
import { diffFields, logActivity, themeOfProject } from './activity.ts';
import { getProject } from './projects.ts';

export function getMilestone(db: Conn, id: number): Milestone {
  const row = db.select().from(milestones).where(eq(milestones.id, id)).get();
  if (!row) throw notFound('里程碑', id);
  return row;
}

function log(db: Conn, m: Milestone, action: ActivityAction, changes?: Record<string, [unknown, unknown]>) {
  logActivity(db, {
    entityType: 'milestone',
    entityId: m.id,
    action,
    projectId: m.projectId,
    themeId: themeOfProject(db, m.projectId),
    payload: changes ? { title: m.title, changes } : { title: m.title },
  });
}

export function createMilestone(db: Conn, projectId: number, input: CreateMilestoneInput): Milestone {
  getProject(db, projectId);
  // 默认排在已有里程碑之后。
  const last = db
    .select({ n: max(milestones.sortOrder) })
    .from(milestones)
    .where(eq(milestones.projectId, projectId))
    .get();
  const values: NewMilestone = {
    projectId,
    title: input.title,
    dueDate: input.dueDate ?? null,
    sortOrder: input.sortOrder ?? (last?.n ?? 0) + 1,
  };
  const milestone = db.insert(milestones).values(values).returning().get();
  log(db, milestone, 'created');
  return milestone;
}

export function updateMilestone(db: Conn, id: number, patch: UpdateMilestoneInput): Milestone {
  const existing = getMilestone(db, id);
  const set: Partial<NewMilestone> = {};
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.dueDate !== undefined) set.dueDate = patch.dueDate;
  if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
  const toggled = patch.done !== undefined && patch.done !== (existing.doneAt !== null);
  if (toggled) set.doneAt = patch.done ? new Date() : null;

  const { doneAt: _doneAt, ...visible } = set;
  const changes = diffFields(existing, visible);
  if (!toggled && Object.keys(changes).length === 0) return existing;

  db.update(milestones).set(set).where(eq(milestones.id, id)).run();
  const milestone = getMilestone(db, id);
  const action: ActivityAction = toggled ? (patch.done ? 'completed' : 'reopened') : 'updated';
  log(db, milestone, action, Object.keys(changes).length ? changes : undefined);
  return milestone;
}

/** 删除里程碑：关联任务保留，只是不再指向该里程碑。 */
export function deleteMilestone(db: Conn, id: number): void {
  const milestone = getMilestone(db, id);
  db.delete(milestones).where(eq(milestones.id, id)).run();
  log(db, milestone, 'deleted');
}
