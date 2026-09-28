import { and, isNotNull, ne } from 'drizzle-orm';
import type { Conn } from '../db.ts';
import { milestones, projects, tasks, type Project } from '../schema.ts';
import type { ProjectSummary, ThemeMap } from '../types.ts';
import { progressFromTasks } from './progress.ts';
import { milestoneOrder, projectOrder, withMilestoneProgress } from './projects.ts';
import { queryTaskViews } from './tasks.ts';
import { listThemes } from './themes.ts';

/** 议题地图：议题 → 课题 → 里程碑，附带各层的任务完成进度。 */
export function getThemeMap(db: Conn): ThemeMap {
  const themeRows = listThemes(db);
  const projectRows = db
    .select()
    .from(projects)
    .orderBy(...projectOrder)
    .all();
  const milestoneRows = db
    .select()
    .from(milestones)
    .orderBy(...milestoneOrder)
    .all();
  // 个人使用的数据量不大，一次取出全部任务的归属和状态在内存里汇总即可。
  const taskRows = db
    .select({
      projectId: tasks.projectId,
      themeId: tasks.themeId,
      milestoneId: tasks.milestoneId,
      status: tasks.status,
    })
    .from(tasks)
    .all();
  const themeOpenTasks = queryTaskViews(db, and(isNotNull(tasks.themeId), ne(tasks.status, 'done')));

  const summarize = (p: Project): ProjectSummary => {
    const own = taskRows.filter((t) => t.projectId === p.id);
    return {
      ...p,
      progress: progressFromTasks(own),
      milestones: withMilestoneProgress(
        milestoneRows.filter((m) => m.projectId === p.id),
        own,
      ),
      openTaskCount: own.filter((t) => t.status !== 'done').length,
    };
  };

  return {
    themes: themeRows.map((theme) => {
      const themeProjects = projectRows.filter((p) => p.themeId === theme.id);
      const projectIds = new Set(themeProjects.map((p) => p.id));
      const allTasks = taskRows.filter(
        (t) => t.themeId === theme.id || (t.projectId !== null && projectIds.has(t.projectId)),
      );
      return {
        ...theme,
        progress: progressFromTasks(allTasks),
        projects: themeProjects.map(summarize),
        openTasks: themeOpenTasks.filter((t) => t.themeId === theme.id),
      };
    }),
    unassignedProjects: projectRows.filter((p) => p.themeId === null).map(summarize),
  };
}
