import { count } from 'drizzle-orm';
import type { Db } from './db.ts';
import { dailyPlans, inboxItems, milestones, projects, tasks, themes, weeklyPlans } from './schema.ts';
import { addDays, isoWeekKey } from './week.ts';

/**
 * 写入一套示例数据，演示"议题 → 课题 → 里程碑 → 任务 → 周计划 → 日计划"的完整链条。
 * 只在数据库还没有任何议题时执行，返回是否真的写入了数据。
 */
export function seedSampleData(db: Db, today: string): boolean {
  const existing = db.select({ n: count() }).from(themes).get();
  if (existing && existing.n > 0) return false;

  const weekKey = isoWeekKey(today);

  db.transaction((tx) => {
    const theme = tx
      .insert(themes)
      .values({
        title: '【示例】研究议题',
        description: '一个长期研究方向。可以在这里写下它为什么重要、想回答哪些大问题。',
        coreQuestions: ['核心问题一：这个领域最缺的证据是什么？', '核心问题二：我能用什么方法补上它？'],
        startedAt: addDays(today, -365),
      })
      .returning()
      .get();

    const paper = tx
      .insert(projects)
      .values({
        themeId: theme.id,
        title: '【示例】课题：一篇期刊论文',
        kind: 'paper',
        status: 'active',
        priority: 1,
        startedAt: addDays(today, -60),
        deadline: addDays(today, 90),
        currentStatus: '数据已收集完毕，正在做描述性分析。',
      })
      .returning()
      .get();

    const grant = tx
      .insert(projects)
      .values({
        themeId: theme.id,
        title: '【示例】课题：一份基金申请',
        kind: 'grant',
        status: 'idea',
        priority: 2,
        deadline: addDays(today, 150),
      })
      .returning()
      .get();

    const [analysis, draft] = tx
      .insert(milestones)
      .values([
        { projectId: paper.id, title: '完成主要分析', dueDate: addDays(today, 21), sortOrder: 1 },
        { projectId: paper.id, title: '完成初稿', dueDate: addDays(today, 60), sortOrder: 2 },
      ])
      .returning()
      .all();

    const inserted = tx
      .insert(tasks)
      .values([
        {
          projectId: paper.id,
          milestoneId: analysis?.id,
          title: '清洗数据并记录处理步骤',
          status: 'done',
          weekKey,
          doneAt: new Date(),
        },
        {
          projectId: paper.id,
          milestoneId: analysis?.id,
          title: '跑描述性统计并画图',
          status: 'doing',
          priority: 1,
          weekKey,
          scheduledDate: today,
        },
        {
          projectId: paper.id,
          milestoneId: draft?.id,
          title: '写方法部分提纲',
          weekKey,
          scheduledDate: today,
        },
        { projectId: grant.id, title: '整理基金指南的申请要求' },
        { themeId: theme.id, title: '读一篇该领域近期的综述', weekKey },
      ])
      .returning()
      .all();

    tx.insert(weeklyPlans)
      .values({ weekKey, focus: ['推进论文的主要分析', '读完一篇综述'] })
      .run();

    tx.insert(dailyPlans)
      .values({
        date: today,
        topTaskIds: inserted.filter((t) => t.scheduledDate === today).map((t) => t.id),
      })
      .run();

    tx.insert(inboxItems).values({ content: '想法：可以换一种识别策略检验稳健性？' }).run();
  });

  return true;
}
