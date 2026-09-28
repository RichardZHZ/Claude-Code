import { expect, test, type APIRequestContext } from '@playwright/test';

// 提醒、议题倒计时、课题动态、日历导出。
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

test('议题倒计时：在议题里设定，今日、本周、议题地图和桌面小窗按秒显示', async ({ page, request }) => {
  // 在议题地图编辑议题，填上倒计时截止
  await page.goto('/map');
  await page.getByRole('button', { name: '编辑议题：城市绿地' }).click();
  await page.getByLabel('倒计时截止').fill('2099-06-30T18:00:15');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('议题已更新')).toBeVisible();
  const card = page.getByTestId('theme-card').filter({ hasText: '城市绿地' });
  await expect(card.getByTestId('theme-countdown')).toContainText('2099年6月30日 18:00:15 截止');

  // 今日页：倒计时在原来日志和复盘的位置，按秒跳动
  await page.getByRole('link', { name: '今日' }).click();
  const countdown = page
    .getByTestId('countdown-card')
    .getByTestId('countdown')
    .filter({ hasText: '城市绿地' });
  const timer = countdown.getByRole('timer');
  await expect(timer).toHaveAttribute('aria-label', /^还剩 \d+ 天 \d+ 小时 \d+ 分 \d+ 秒$/);
  const before = await timer.getAttribute('aria-label');
  await expect(timer).not.toHaveAttribute('aria-label', before!, { timeout: 3000 });
  await expect(page.getByTestId('day-review')).toHaveCount(0);

  // 本周页：同样的倒计时，周复盘已经移除
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '本周' }).click();
  await expect(page.getByTestId('countdown-card')).toContainText('城市绿地');
  await expect(page.getByTestId('week-review')).toHaveCount(0);

  // 桌面小窗顶部
  await page.goto('/widget');
  await expect(page.getByTestId('widget-countdowns')).toContainText('城市绿地');
  await expect(page.getByTestId('widget-countdown').getByRole('timer')).toHaveAttribute(
    'aria-label',
    /^还剩/,
  );

  // 已过的截止时刻显示"已超过"
  const themes = (await (await request.get('/api/themes')).json()) as { id: number; title: string }[];
  const theme = themes.find((t) => t.title === '城市绿地')!;
  await request.patch(`/api/themes/${theme.id}`, { data: { countdownAt: '2020-01-01T00:00:00Z' } });
  await page.reload();
  await expect(page.getByTestId('widget-countdown').getByRole('timer')).toHaveAttribute(
    'aria-label',
    /^已超过/,
  );

  // 清除倒计时
  await page.goto('/map');
  await page.getByRole('button', { name: '编辑议题：城市绿地' }).click();
  await page.getByRole('button', { name: '清除' }).click();
  await page.getByRole('button', { name: '保存' }).click();
  await expect(card.getByTestId('theme-countdown')).toHaveCount(0);
  await page.getByRole('link', { name: '今日' }).click();
  await expect(page.getByTestId('countdown-card')).toContainText('还没有议题设了倒计时');
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
