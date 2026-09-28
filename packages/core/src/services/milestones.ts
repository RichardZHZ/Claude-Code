import { eq, max } from 'drizzle-orm';
import type { CreateMilestoneInput, UpdateMilestoneInput } from '../contracts.ts';
import type { Conn } from '../db.ts';
import { notFound } from '../errors.ts';
import { milestones, type Milestone, type NewMilestone } from '../schema.ts';
import { getProject } from './projects.ts';

export function getMilestone(db: Conn, id: number): Milestone {
  const row = db.select().from(milestones).where(eq(milestones.id, id)).get();
  if (!row) throw notFound('里程碑', id);
  return row;
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
  return db.insert(milestones).values(values).returning().get();
}

export function updateMilestone(db: Conn, id: number, patch: UpdateMilestoneInput): Milestone {
  const existing = getMilestone(db, id);
  const set: Partial<NewMilestone> = {};
  if (patch.title !== undefined) set.title = patch.title;
  if (patch.dueDate !== undefined) set.dueDate = patch.dueDate;
  if (patch.sortOrder !== undefined) set.sortOrder = patch.sortOrder;
  if (patch.done !== undefined && patch.done !== (existing.doneAt !== null)) {
    set.doneAt = patch.done ? new Date() : null;
  }
  if (Object.keys(set).length > 0) db.update(milestones).set(set).where(eq(milestones.id, id)).run();
  return getMilestone(db, id);
}

/** 删除里程碑：关联任务保留，只是不再指向该里程碑。 */
export function deleteMilestone(db: Conn, id: number): void {
  const res = db.delete(milestones).where(eq(milestones.id, id)).run();
  if (res.changes === 0) throw notFound('里程碑', id);
}
