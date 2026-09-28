import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db.ts';
import { DomainError } from '../errors.ts';
import { runMigrations } from '../migrate.ts';
import { resources } from '../schema.ts';
import { fakeZoteroFetch } from '../testing/fake-zotero.ts';
import { createZoteroClient } from '../zotero.ts';
import { listActivity } from './activity.ts';
import { getWeekView } from './plans.ts';
import { createProject, deleteProject } from './projects.ts';
import {
  addResource,
  deleteResource,
  linkZoteroItem,
  listResources,
  literatureLinkedInWeek,
} from './resources.ts';
import { createTask, deleteTask } from './tasks.ts';
import { isoWeekKey, shiftWeek, toDateString } from '../week.ts';
import { createTheme } from './themes.ts';

let db: Db;
const zotero = createZoteroClient({ baseUrl: 'http://127.0.0.1:23119', fetch: fakeZoteroFetch() });

beforeEach(() => {
  db = openDb(':memory:');
  runMigrations(db);
});

function setup() {
  const theme = createTheme(db, { title: '城市热岛' });
  const project = createProject(db, { title: '热岛与健康', themeId: theme.id });
  return { theme, project };
}

const owner = (id: number) => ({ ownerType: 'project' as const, ownerId: id });

describe('资源', () => {
  it('添加链接并记入活动日志', () => {
    const { theme, project } = setup();
    const r = addResource(db, {
      ...owner(project.id),
      kind: 'url',
      ref: 'https://overleaf.com/p/1',
      label: 'Overleaf',
    });
    expect(r).toMatchObject({ kind: 'url', label: 'Overleaf', ownerTitle: '热岛与健康' });
    const [log] = listActivity(db, { projectId: project.id, limit: 1 });
    expect(log).toMatchObject({
      action: 'linked',
      themeId: theme.id,
      summary: '关联链接"Overleaf"（热岛与健康）',
    });
  });

  it('同一对象不能重复添加同一个链接', () => {
    const { project } = setup();
    addResource(db, { ...owner(project.id), kind: 'url', ref: 'https://a.com' });
    expect(() => addResource(db, { ...owner(project.id), kind: 'url', ref: 'https://a.com' })).toThrow(
      /已经添加过/,
    );
  });

  it('所属对象不存在时报 not_found', () => {
    expect(() => addResource(db, { ...owner(9), kind: 'url', ref: 'https://a.com' })).toThrow(DomainError);
  });

  it('从 Zotero 关联文献，保存引文和元数据快照', async () => {
    const { project } = setup();
    const r = await linkZoteroItem(db, zotero, owner(project.id), 'OKE1982A');
    expect(r).toMatchObject({
      kind: 'zotero',
      ref: 'OKE1982A',
      label: 'Oke (1982) The energetic basis of the urban heat island',
      meta: { creators: 'Oke', year: '1982', doi: '10.1002/qj.49710845502' },
    });
    await expect(linkZoteroItem(db, zotero, owner(project.id), 'OKE1982A')).rejects.toThrow(/已经关联过/);
    expect(listActivity(db, { limit: 1 })[0]?.summary).toBe(
      '关联文献"Oke (1982) The energetic basis of the urban heat island"（热岛与健康）',
    );
  });

  it('删除资源记一笔"移除"', async () => {
    const { project } = setup();
    const r = await linkZoteroItem(db, zotero, owner(project.id), 'LIZHAO15');
    deleteResource(db, r.id);
    expect(listResources(db, owner(project.id))).toEqual([]);
    expect(listActivity(db, { limit: 1 })[0]?.summary).toMatch(/^移除文献"Li et al\. \(2015\)/);
  });

  it('删除课题或任务时，其名下的资源一并清理', async () => {
    const { theme, project } = setup();
    const task = createTask(db, { title: '读文献', projectId: project.id });
    await linkZoteroItem(db, zotero, { ownerType: 'task', ownerId: task.id }, 'OKE1982A');
    await linkZoteroItem(db, zotero, owner(project.id), 'OKE1982A');
    addResource(db, { ownerType: 'theme', ownerId: theme.id, kind: 'url', ref: 'https://a.com' });

    deleteTask(db, task.id);
    expect(db.select().from(resources).all()).toHaveLength(2);
    deleteProject(db, project.id);
    expect(
      db
        .select()
        .from(resources)
        .all()
        .map((r) => r.ownerType),
    ).toEqual(['theme']);
  });

  it('本周新关联的文献出现在周视图里', async () => {
    const { project } = setup();
    await linkZoteroItem(db, zotero, owner(project.id), 'OKE1982A');
    // 关联时间是"现在"，所以落在本机日期所在的这一周。
    const weekKey = isoWeekKey(toDateString(new Date()));
    expect(literatureLinkedInWeek(db, weekKey).map((r) => r.ref)).toEqual(['OKE1982A']);
    expect(literatureLinkedInWeek(db, shiftWeek(weekKey, -1))).toEqual([]);
    expect(getWeekView(db, weekKey).literature.map((r) => r.label)).toEqual([
      'Oke (1982) The energetic basis of the urban heat island',
    ]);
  });
});
