import { describe, expect, it } from 'vitest';
import {
  createTaskInput,
  createThemeInput,
  dayPlanInput,
  promoteInboxInput,
  taskQuery,
  updateProjectInput,
  weekPlanInput,
} from './contracts.ts';

describe('输入校验', () => {
  it('标题去掉首尾空白，不能为空', () => {
    expect(createThemeInput.parse({ title: '  议题 ' }).title).toBe('议题');
    expect(createThemeInput.safeParse({ title: '   ' }).success).toBe(false);
  });

  it('可选长文本：空字符串变成 null', () => {
    expect(updateProjectInput.parse({ currentStatus: '  ' }).currentStatus).toBeNull();
    expect(updateProjectInput.parse({}).currentStatus).toBeUndefined();
  });

  it('日期与周编号格式', () => {
    expect(createTaskInput.safeParse({ title: 't', scheduledDate: '2026-02-30' }).success).toBe(false);
    expect(createTaskInput.safeParse({ title: 't', weekKey: '2026-40' }).success).toBe(false);
    expect(createTaskInput.safeParse({ title: 't', weekKey: '2026-W40' }).success).toBe(true);
  });

  it('本周重点去掉空行，最多 5 条', () => {
    expect(weekPlanInput.parse({ focus: ['a', ' ', 'b '] }).focus).toEqual(['a', 'b']);
    expect(weekPlanInput.safeParse({ focus: ['1', '2', '3', '4', '5', '6'] }).success).toBe(false);
  });

  it('每天最重要的事最多 3 件且不重复', () => {
    expect(dayPlanInput.safeParse({ topTaskIds: [1, 2, 3, 4] }).success).toBe(false);
    expect(dayPlanInput.safeParse({ topTaskIds: [1, 1] }).success).toBe(false);
    expect(dayPlanInput.safeParse({ topTaskIds: [3, 1] }).success).toBe(true);
  });

  it('查询参数从字符串转换', () => {
    expect(taskQuery.parse({ projectId: '3', open: 'true' })).toEqual({ projectId: 3, open: true });
  });

  it('收件箱升级按类型区分字段', () => {
    expect(promoteInboxInput.safeParse({ type: 'task', projectId: 1 }).success).toBe(true);
    expect(promoteInboxInput.safeParse({ type: 'nope' }).success).toBe(false);
  });
});
