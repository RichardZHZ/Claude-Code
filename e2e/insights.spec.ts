import { expect, test, type APIRequestContext } from '@playwright/test';

// 第二阶段：提醒、复盘历史、课题动态、日历导出。
// 用接口准备自己的数据，不依赖其他测试文件的执行顺序。

test.describe.configure({ mode: 'serial' });

const PROJECT = '城市绿地降温课题';

/** 本机日期加若干天，格式 YYYY-MM-DD。 */
function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function post<T>(request: APIRequestContext, path: string, data: unknown): Promise<T> {
  const res = await request.post(`/api${path}`, { data });
  expect(res.ok()).toBe(true);
  return (await res.json()) as T;
}

let projectId: number;

test.beforeAll(async ({ request }) => {
  const theme = await post<{ id: number }>(request, '/themes', { title: '城市绿地' });
  const project = await post<{ id: number }>(request, '/projects', {
    title: PROJECT,
    themeId: theme.id,
    deadline: localDate(60),
  });
  projectId = project.id;
});

test('临近到期的里程碑出现在提醒里，完成后消失', async ({ page }) => {
  // 两天后到期、没有关联任务的里程碑
  await page.goto(`/projects/${projectId}`);
  await page.getByLabel('新里程碑名称').fill('完成实地测温');
  await page.getByLabel('里程碑目标日期').fill(localDate(2));
  await page.getByTestId('milestones').getByRole('button', { name: '添加' }).click();
  await expect(page.getByTestId('milestones').getByText('完成实地测温')).toBeVisible();

  // 今日页顶部出现提醒横幅，侧边栏有提醒数
  await page.getByRole('link', { name: '今日' }).click();
  await expect(page.getByTestId('checks-banner')).toContainText('完成实地测温');
  await expect(page.getByRole('link', { name: /提醒/ }).getByLabel(/条需要注意/)).toBeVisible();

  // 提醒页列出这条，点进去回到课题
  await page.getByTestId('checks-banner').getByRole('link').click();
  const issue = page.getByTestId('health-issue').filter({ hasText: '完成实地测温' });
  await expect(issue).toHaveAttribute('data-rule', 'milestone_at_risk');
  await expect(issue).toContainText('还剩 2 天');
  await issue.getByRole('link').click();
  await expect(page.getByRole('heading', { name: PROJECT })).toBeVisible();

  // 勾掉里程碑，提醒消失
  await page.getByRole('checkbox', { name: '里程碑完成：完成实地测温' }).click();
  await expect(page.getByRole('checkbox', { name: '里程碑完成：完成实地测温' })).toBeChecked();
  await page.getByRole('link', { name: /提醒/ }).click();
  await expect(page.getByTestId('health-issue').filter({ hasText: '完成实地测温' })).toHaveCount(0);
});

test('课题页显示最近动态', async ({ page }) => {
  await page.goto(`/projects/${projectId}`);
  await page.getByTestId('column-todo').getByLabel('课题的新任务').fill('布设温度计');
  await page.getByTestId('column-todo').getByRole('button', { name: '添加' }).click();
  await page.getByRole('checkbox', { name: '标记为完成：布设温度计' }).click();

  const feed = page.getByTestId('activity-feed');
  await expect(feed.getByText('完成任务"布设温度计"')).toBeVisible();
  await expect(feed.getByText('新建任务"布设温度计"')).toBeVisible();
  await expect(feed.getByText('完成里程碑"完成实地测温"')).toBeVisible();
  await expect(feed.getByText(`新建课题"${PROJECT}"`)).toBeVisible();
});

test('保存复盘后出现在回顾时间线，并可按类型筛选', async ({ page }) => {
  // 晚间复盘保存两次：时间线只显示最新一版，并注明修改次数
  await page.goto('/today');
  const review = page.getByTestId('day-review');
  await review.getByLabel('今天完成了什么').fill('测温点位确定');
  await review.getByRole('button', { name: '保存复盘' }).click();
  await expect(review.getByText(/已于 \d{2}:\d{2} 复盘/)).toBeVisible();
  await review.getByLabel('今天完成了什么').fill('测温点位确定，布设了温度计');
  await review.getByRole('button', { name: '保存复盘' }).click();

  // 周复盘
  await page.getByRole('link', { name: '本周' }).click();
  const weekReview = page.getByTestId('week-review');
  await weekReview.getByLabel('反思').fill('野外工作比预想的慢。');
  await weekReview.getByRole('button', { name: '保存周复盘' }).click();
  await expect(weekReview.getByText(/已于 \d{2}:\d{2} 保存/)).toBeVisible();

  await page.getByRole('link', { name: '回顾' }).click();
  const timeline = page.getByTestId('review-timeline');
  const day = timeline.locator('[data-kind="day"]').filter({ hasText: '布设了温度计' });
  await expect(day).toBeVisible();
  await expect(day).toContainText(/共修改 \d+ 次/);
  await expect(
    timeline.locator('[data-kind="week"]').filter({ hasText: '野外工作比预想的慢。' }),
  ).toBeVisible();

  await page.getByRole('tab', { name: '周复盘' }).click();
  await expect(timeline.locator('[data-kind="day"]')).toHaveCount(0);
  await expect(timeline.locator('[data-kind="week"]').first()).toBeVisible();
});

test('日历导出包含未完成的截止日期', async ({ page, request }) => {
  const res = await request.get('/api/calendar.ics');
  expect(res.headers()['content-type']).toContain('text/calendar');
  const ics = await res.text();
  expect(ics).toContain(`SUMMARY:截止：${PROJECT}`);
  expect(ics).toContain(`DTSTART;VALUE=DATE:${localDate(60).replaceAll('-', '')}`);
  // 已完成的里程碑不再出现
  expect(ics).not.toContain('完成实地测温');

  await page.goto('/map');
  await page.getByRole('button', { name: '导出到日历' }).click();
  await expect(page.getByRole('menuitem', { name: '下载 .ics 文件' })).toHaveAttribute(
    'href',
    '/api/calendar.ics',
  );
});
