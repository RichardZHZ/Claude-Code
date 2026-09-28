import { and, desc, eq, inArray, lt, max, sql, type SQL } from 'drizzle-orm';
import type { Conn } from '../db.ts';
import type { ReviewKind } from '../enums.ts';
import { reviews } from '../schema.ts';
import type { ReviewEntry } from '../types.ts';

export type ReviewQuery = {
  kind?: ReviewKind;
  /** 只取 id 小于它的记录，用于翻页。 */
  before?: number;
  limit?: number;
};

/**
 * 复盘时间线：每个周期（某一周或某一天）只取最新一版，附带共保存过几次。
 * 按最近保存的先后排序。
 */
export function listReviews(db: Conn, q: ReviewQuery = {}): ReviewEntry[] {
  const latestIds = db
    .select({ id: max(reviews.id) })
    .from(reviews)
    .groupBy(reviews.kind, reviews.periodKey);

  const conds: SQL[] = [inArray(reviews.id, latestIds)];
  if (q.kind !== undefined) conds.push(eq(reviews.kind, q.kind));
  if (q.before !== undefined) conds.push(lt(reviews.id, q.before));

  return db
    .select({
      review: reviews,
      // 单表查询时 drizzle 不给列名加表名前缀，这里显式写出外层表，避免被子查询的同名列遮住。
      versions: sql<number>`(select count(*) from reviews r2 where r2.kind = "reviews"."kind" and r2.period_key = "reviews"."period_key")`,
    })
    .from(reviews)
    .where(and(...conds))
    .orderBy(desc(reviews.id))
    .limit(Math.min(q.limit ?? 20, 100))
    .all()
    .map((r) => ({ ...r.review, versions: Number(r.versions) }));
}
