import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from './db.ts';
import { runMigrations } from './migrate.ts';
import { dailyPlans, milestones, projects, tasks, themes, weeklyPlans } from './schema.ts';
import { seedSampleData } from './seed.ts';

let db: Db;

beforeEach(() => {
  db = openDb(':memory:');
  runMigrations(db);
});

describe('表结构约束', () => {
  it('任务必须挂在课题或议题下', () => {
    expect(() => db.insert(tasks).values({ title: '孤儿任务' }).run()).toThrow(/CHECK constraint/);
  });

  it('任务可以只挂在议题下', () => {
    const theme = db.insert(themes).values({ title: '议题' }).returning().get();
    const task = db.insert(tasks).values({ themeId: theme.id, title: '读综述' }).returning().get();
    expect(task.projectId).toBeNull();
    expect(task.status).toBe('todo');
  });

  it('优先级只能是 1 到 3', () => {
    expect(() => db.insert(projects).values({ title: '课题', priority: 5 }).run()).toThrow(
      /CHECK constraint/,
    );
  });

  it('删除课题会级联删除里程碑和任务', () => {
    const project = db.insert(projects).values({ title: '课题' }).returning().get();
    db.insert(milestones).values({ projectId: project.id, title: '里程碑' }).run();
    db.insert(tasks).values({ projectId: project.id, title: '任务' }).run();
    db.delete(projects).where(eq(projects.id, project.id)).run();
    expect(db.select().from(milestones).all()).toHaveLength(0);
    expect(db.select().from(tasks).all()).toHaveLength(0);
  });

  it('删除议题时课题保留，但与议题解除关联', () => {
    const theme = db.insert(themes).values({ title: '议题' }).returning().get();
    const project = db.insert(projects).values({ themeId: theme.id, title: '课题' }).returning().get();
    db.delete(themes).where(eq(themes.id, theme.id)).run();
    const after = db.select().from(projects).where(eq(projects.id, project.id)).get();
    expect(after?.themeId).toBeNull();
  });

  it('同一周只能有一份周计划', () => {
    db.insert(weeklyPlans).values({ weekKey: '2026-W40' }).run();
    expect(() => db.insert(weeklyPlans).values({ weekKey: '2026-W40' }).run()).toThrow(/UNIQUE/);
  });

  it('JSON 字段读写保持结构', () => {
    const theme = db
      .insert(themes)
      .values({ title: '议题', coreQuestions: ['问题一', '问题二'] })
      .returning()
      .get();
    expect(theme.coreQuestions).toEqual(['问题一', '问题二']);
    expect(theme.createdAt).toBeInstanceOf(Date);
  });
});

describe('示例数据', () => {
  it('写入完整的目标链，且只写一次', () => {
    expect(seedSampleData(db, '2026-09-28')).toBe(true);
    expect(seedSampleData(db, '2026-09-28')).toBe(false);

    expect(db.select().from(themes).all()).toHaveLength(1);
    expect(db.select().from(projects).all()).toHaveLength(2);
    const weekTasks = db.select().from(tasks).where(eq(tasks.weekKey, '2026-W40')).all();
    expect(weekTasks.length).toBeGreaterThan(0);

    const today = db.select().from(dailyPlans).where(eq(dailyPlans.date, '2026-09-28')).get();
    expect(today?.topTaskIds).toHaveLength(2);
  });
});
