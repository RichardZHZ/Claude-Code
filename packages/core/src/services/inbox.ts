import { asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { CreateInboxInput, PromoteInboxInput } from '../contracts.ts';
import type { Conn } from '../db.ts';
import { invalid, notFound } from '../errors.ts';
import { inboxItems, type InboxItem } from '../schema.ts';
import type { InboxList, PromoteResult } from '../types.ts';
import { createProject } from './projects.ts';
import { createTask } from './tasks.ts';
import { createTheme } from './themes.ts';

/** 已处理的记录只显示最近这么多条。 */
const PROCESSED_LIMIT = 50;

export function listInbox(db: Conn): InboxList {
  return {
    pending: db
      .select()
      .from(inboxItems)
      .where(isNull(inboxItems.promotedType))
      .orderBy(asc(inboxItems.id))
      .all(),
    processed: db
      .select()
      .from(inboxItems)
      .where(isNotNull(inboxItems.promotedType))
      .orderBy(desc(inboxItems.updatedAt), desc(inboxItems.id))
      .limit(PROCESSED_LIMIT)
      .all(),
  };
}

export function createInboxItem(db: Conn, input: CreateInboxInput): InboxItem {
  return db.insert(inboxItems).values({ content: input.content }).returning().get();
}

export function deleteInboxItem(db: Conn, id: number): void {
  const res = db.delete(inboxItems).where(eq(inboxItems.id, id)).run();
  if (res.changes === 0) throw notFound('收件箱记录', id);
}

/** 默认标题：取内容的第一行。 */
function defaultTitle(content: string): string {
  return (content.split('\n')[0] ?? content).trim().slice(0, 200) || content.slice(0, 200);
}

/** 把一条收件箱记录升级为议题、课题或任务，并标记为已处理。 */
export function promoteInboxItem(db: Conn, id: number, input: PromoteInboxInput): PromoteResult {
  return db.transaction((tx) => {
    const item = tx.select().from(inboxItems).where(eq(inboxItems.id, id)).get();
    if (!item) throw notFound('收件箱记录', id);
    if (item.promotedType !== null) throw invalid('这条记录已经处理过了');

    const title = input.title ?? defaultTitle(item.content);
    const notes = item.content === title ? null : item.content;
    let created: PromoteResult['created'];

    switch (input.type) {
      case 'theme':
        created = { type: 'theme', id: createTheme(tx, { title, description: notes }).id };
        break;
      case 'project':
        created = {
          type: 'project',
          id: createProject(tx, { title, themeId: input.themeId ?? null, description: notes }).id,
        };
        break;
      case 'task':
        created = {
          type: 'task',
          id: createTask(tx, {
            title,
            notes,
            projectId: input.projectId ?? null,
            themeId: input.themeId ?? null,
            weekKey: input.weekKey ?? null,
            scheduledDate: input.scheduledDate ?? null,
          }).id,
        };
        break;
    }

    const updated = tx
      .update(inboxItems)
      .set({ promotedType: created.type, promotedId: created.id })
      .where(eq(inboxItems.id, id))
      .returning()
      .get();
    return { item: updated, created };
  });
}
