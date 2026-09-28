import { and, asc, eq, gte, lt, sql } from 'drizzle-orm';
import type { AddResourceInput } from '../contracts.ts';
import type { Conn } from '../db.ts';
import type { ResourceKind, ResourceOwnerType } from '../enums.ts';
import { invalid, notFound } from '../errors.ts';
import { projects, resources, tasks, themes, type Resource, type ResourceMeta } from '../schema.ts';
import type { ResourceView } from '../types.ts';
import { addDays, startOfLocalDay, weekRange } from '../week.ts';
import { formatCitation, zoteroMeta, type ZoteroClient } from '../zotero.ts';
import { logActivity, themeOfProject } from './activity.ts';

type Owner = { ownerType: ResourceOwnerType; ownerId: number };

/** 资源所属对象的标题与活动日志上下文；对象不存在时报 not_found。 */
function resolveOwner(db: Conn, { ownerType, ownerId }: Owner) {
  if (ownerType === 'theme') {
    const t = db.select({ title: themes.title }).from(themes).where(eq(themes.id, ownerId)).get();
    if (!t) throw notFound('议题', ownerId);
    return { title: t.title, projectId: null, themeId: ownerId };
  }
  if (ownerType === 'project') {
    const p = db
      .select({ title: projects.title, themeId: projects.themeId })
      .from(projects)
      .where(eq(projects.id, ownerId))
      .get();
    if (!p) throw notFound('课题', ownerId);
    return { title: p.title, projectId: ownerId, themeId: p.themeId };
  }
  const t = db
    .select({ title: tasks.title, projectId: tasks.projectId, themeId: tasks.themeId })
    .from(tasks)
    .where(eq(tasks.id, ownerId))
    .get();
  if (!t) throw notFound('任务', ownerId);
  return { title: t.title, projectId: t.projectId, themeId: t.themeId ?? themeOfProject(db, t.projectId) };
}

/** 资源所属对象的标题（对象已删除时为 null）。 */
const ownerTitle = sql<string | null>`case ${resources.ownerType}
  when 'theme' then (select title from themes where id = ${resources.ownerId})
  when 'project' then (select title from projects where id = ${resources.ownerId})
  else (select title from tasks where id = ${resources.ownerId}) end`;

function views(db: Conn, where: ReturnType<typeof and>): ResourceView[] {
  return db
    .select({ resource: resources, ownerTitle })
    .from(resources)
    .where(where)
    .orderBy(asc(resources.kind), asc(resources.id))
    .all()
    .map((r) => ({ ...r.resource, ownerTitle: r.ownerTitle }));
}

export function listResources(db: Conn, owner: Owner): ResourceView[] {
  resolveOwner(db, owner);
  return views(db, and(eq(resources.ownerType, owner.ownerType), eq(resources.ownerId, owner.ownerId)));
}

type NewResource = Owner & {
  kind: ResourceKind;
  ref: string;
  label?: string | null;
  meta?: ResourceMeta | null;
};

function insertResource(db: Conn, input: NewResource): ResourceView {
  const owner = resolveOwner(db, input);
  const dup = db
    .select({ id: resources.id })
    .from(resources)
    .where(
      and(
        eq(resources.ownerType, input.ownerType),
        eq(resources.ownerId, input.ownerId),
        eq(resources.kind, input.kind),
        eq(resources.ref, input.ref),
      ),
    )
    .get();
  if (dup) throw invalid(input.kind === 'zotero' ? '这篇文献已经关联过了' : '这个链接已经添加过了');

  const row = db
    .insert(resources)
    .values({
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      kind: input.kind,
      ref: input.ref,
      label: input.label ?? null,
      meta: input.meta ?? null,
    })
    .returning()
    .get();
  logActivity(db, {
    entityType: 'resource',
    entityId: row.id,
    action: 'linked',
    projectId: owner.projectId,
    themeId: owner.themeId,
    payload: { title: row.label ?? row.ref, kind: row.kind, ownerTitle: owner.title },
  });
  return { ...row, ownerTitle: owner.title };
}

/** 添加链接或文件路径。Zotero 文献请用 linkZoteroItem。 */
export function addResource(db: Conn, input: AddResourceInput): ResourceView {
  return insertResource(db, { ...input, label: input.label || null });
}

/** 从 Zotero 取条目信息并关联到议题、课题或任务，同时保存元数据快照。 */
export async function linkZoteroItem(
  db: Conn,
  zotero: ZoteroClient,
  owner: Owner,
  itemKey: string,
): Promise<ResourceView> {
  resolveOwner(db, owner);
  const item = await zotero.getItem(itemKey);
  return insertResource(db, {
    ...owner,
    kind: 'zotero',
    ref: item.key,
    label: formatCitation(item),
    meta: zoteroMeta(item),
  });
}

export function getResource(db: Conn, id: number): Resource {
  const row = db.select().from(resources).where(eq(resources.id, id)).get();
  if (!row) throw notFound('资源', id);
  return row;
}

export function deleteResource(db: Conn, id: number): void {
  const row = getResource(db, id);
  let ctx: { projectId: number | null; themeId: number | null; title: string | null } = {
    projectId: null,
    themeId: null,
    title: null,
  };
  try {
    ctx = resolveOwner(db, row);
  } catch {
    // 所属对象已不存在时照样删除。
  }
  db.delete(resources).where(eq(resources.id, id)).run();
  logActivity(db, {
    entityType: 'resource',
    entityId: id,
    action: 'unlinked',
    projectId: ctx.projectId,
    themeId: ctx.themeId,
    payload: { title: row.label ?? row.ref, kind: row.kind, ownerTitle: ctx.title },
  });
}

/** 删除所属对象已不存在的资源。资源是多态关联，没有外键，删除议题、课题、任务后调用。 */
export function pruneOrphanResources(db: Conn): number {
  return db
    .delete(resources)
    .where(
      sql`(${resources.ownerType} = 'task' and ${resources.ownerId} not in (select id from tasks))
        or (${resources.ownerType} = 'project' and ${resources.ownerId} not in (select id from projects))
        or (${resources.ownerType} = 'theme' and ${resources.ownerId} not in (select id from themes))`,
    )
    .run().changes;
}

/** 某一周内新关联的 Zotero 文献（按关联时间，本地时区）。 */
export function literatureLinkedInWeek(db: Conn, weekKey: string): ResourceView[] {
  const { start, end } = weekRange(weekKey);
  return views(
    db,
    and(
      eq(resources.kind, 'zotero'),
      gte(resources.createdAt, startOfLocalDay(start)),
      lt(resources.createdAt, startOfLocalDay(addDays(end, 1))),
    ),
  );
}
