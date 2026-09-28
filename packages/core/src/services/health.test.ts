import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db.ts';
import { runMigrations } from '../migrate.ts';
import { activityLog, milestones, projects, tasks, themes } from '../schema.ts';
import { buildHealthSnapshot, getHealthReport } from './health.ts';
import { createMilestone } from './milestones.ts';
import { createProject } from './projects.ts';
import { createTask, updateTask } from './tasks.ts';
import { createTheme } from './themes.ts';

let db: Db;

beforeEach(() => {
  db = openDb(':memory:');
  runMigrations(db);
});

const OLD = new Date('2026-08-01T12:00:00');

/** 把所有记录的时间拨回过去，模拟"很久没动过"。 */
function ageEverything() {
  db.update(themes).set({ createdAt: OLD, updatedAt: OLD }).run();
  db.update(projects).set({ updatedAt: OLD }).run();
  db.update(tasks).set({ updatedAt: OLD }).run();
  db.update(milestones).set({ updatedAt: OLD }).run();
  db.update(activityLog).set({ at: OLD }).run();
}

describe('健康检查（读数据库）', () => {
  it('课题最近活动取活动日志、任务和里程碑中最新的', () => {
    const theme = createTheme(db, { title: '议题' });
    const project = createProject(db, { title: '论文', themeId: theme.id });
    const t = createTask(db, { title: 't', projectId: project.id });
    ageEverything();

    expect(getHealthReport(db, '2026-09-28').issues.map((i) => i.key)).toEqual([
      `stale_project:${project.id}`,
    ]);

    // 动一下任务，课题就不再停滞
    updateTask(db, t.id, { status: 'doing' });
    expect(getHealthReport(db, '2026-09-28').issues).toEqual([]);
  });

  it('里程碑的关联任务进度来自数据库', () => {
    const project = createProject(db, { title: '论文' });
    const m = createMilestone(db, project.id, { title: '初稿', dueDate: '2026-09-30' });
    createTask(db, { title: 'a', milestoneId: m.id, status: 'done' });
    createTask(db, { title: 'b', milestoneId: m.id });
    createTask(db, { title: 'c', milestoneId: m.id });
    const snap = buildHealthSnapshot(db, '2026-09-28');
    expect(snap.milestones[0]).toMatchObject({ taskDone: 1, taskTotal: 3, done: false });
    const report = getHealthReport(db, '2026-09-28');
    expect(report.issues[0]?.key).toBe(`milestone_at_risk:${m.id}`);
    expect(report.counts).toEqual({ danger: 0, warning: 1, info: 0 });
  });

  it('课题删除后遗留的活动日志不影响检查', () => {
    const project = createProject(db, { title: '论文' });
    db.delete(projects).where(eq(projects.id, project.id)).run();
    expect(getHealthReport(db, '2026-09-28').issues).toEqual([]);
  });
});
