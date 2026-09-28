import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// 专心致志（正计时、倒计时）、桌面小窗里的计时和提醒条目、回顾页。
// 用接口准备自己的数据，不依赖其他测试文件的执行顺序。

test.describe.configure({ mode: 'serial' });

const THEME = '专注测试议题';

async function post<T>(request: APIRequestContext, path: string, data: unknown): Promise<T> {
  const res = await request.post(`/api${path}`, { data });
  expect(res.ok()).toBe(true);
  return (await res.json()) as T;
}

/** 删除类操作会弹出确认框，一律确认。 */
function acceptDialogs(page: Page) {
  page.on('dialog', (d) => void d.accept());
}

test.beforeAll(async ({ request }) => {
  await post(request, '/themes', { title: THEME });
});

test('正计时：选议题开始，结束后存档；回顾页按天列出，可以删除', async ({ page }) => {
  acceptDialogs(page);
  await page.goto('/today');
  const card = page.getByTestId('focus-card');
  // 专心致志在倒计时卡片下面
  const countdownBox = await page.getByTestId('countdown-card').boundingBox();
  const focusBox = await card.boundingBox();
  expect(focusBox!.y).toBeGreaterThan(countdownBox!.y);

  await card.getByLabel('专注的议题').selectOption({ label: THEME });
  await expect(card.getByRole('button', { name: '正计时' })).toHaveAttribute('aria-pressed', 'true');
  await card.getByRole('button', { name: '开始' }).click();

  const clock = card.getByTestId('focus-clock');
  await expect(clock).toHaveAttribute('aria-label', /^已专注 00:0\d$/);
  const before = await clock.getAttribute('aria-label');
  await expect(clock).not.toHaveAttribute('aria-label', before!, { timeout: 3000 });
  // 进行中不能切换计时方式和议题
  await expect(card.getByRole('button', { name: '倒计时' })).toBeDisabled();
  await expect(card.getByLabel('专注的议题')).toBeDisabled();

  await card.getByRole('button', { name: '结束并存档' }).click();
  await expect(page.getByText(new RegExp(`已存档：${THEME} \\d+ 秒`))).toBeVisible();
  await expect(card.getByTestId('focus-totals')).toContainText('今天');
  await expect(card.getByTestId('focus-theme-totals')).toContainText(THEME);

  // 回顾页：今天这一天列出这段专注
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '回顾' }).click();
  await expect(page.getByTestId('recap-summary')).toContainText(THEME);
  const session = page.getByTestId('recap-focus-session').filter({ hasText: THEME });
  await expect(session).toHaveCount(1);
  await expect(session).toContainText('正计时');

  await session.hover();
  await session.getByRole('button', { name: /删除专注记录/ }).click();
  await expect(page.getByText('已删除这段专注记录')).toBeVisible();
  await expect(page.getByTestId('recap-focus-session').filter({ hasText: THEME })).toHaveCount(0);
});

test('回顾页列出当天完成的任务', async ({ page, request }) => {
  const themes = (await (await request.get('/api/themes')).json()) as { id: number; title: string }[];
  const theme = themes.find((t) => t.title === THEME)!;
  const task = await post<{ id: number }>(request, '/tasks', { title: '回顾里的任务', themeId: theme.id });
  await request.patch(`/api/tasks/${task.id}`, { data: { status: 'done' } });

  await page.goto('/review');
  const days = page.getByTestId('recap-day');
  await expect(days.first().getByText('今天')).toBeVisible();
  await expect(days.first().getByTestId('recap-completed')).toContainText('回顾里的任务');
  await expect(page.getByTestId('recap-summary')).toContainText(/完成任务 \d+ 项/);

  // 上一周、回到本周
  await page.getByRole('link', { name: '上一周' }).click();
  await expect(page.getByRole('link', { name: '回到本周' })).toBeVisible();
  await page.getByRole('link', { name: '回到本周' }).click();
  await expect(days.first().getByTestId('recap-completed')).toContainText('回顾里的任务');
});

test('倒计时：设定分钟数，到点自动存档', async ({ page }) => {
  test.setTimeout(150_000);
  acceptDialogs(page);
  await page.goto('/week');
  const card = page.getByTestId('focus-card');
  await card.getByLabel('专注的议题').selectOption({ label: THEME });
  await card.getByRole('button', { name: '倒计时' }).click();
  await card.getByLabel('倒计时分钟数').fill('1');
  await expect(card.getByTestId('focus-clock')).toHaveText('01:00');

  // 先试一次"放弃"：不存档
  await card.getByRole('button', { name: '开始' }).click();
  await expect(card.getByTestId('focus-clock')).toHaveAttribute('aria-label', /^还剩 · 共 1 分钟/);
  await card.getByRole('button', { name: '放弃' }).click();
  await expect(page.getByText('已放弃这段专注')).toBeVisible();

  // 再开始一次，等到点
  await card.getByRole('button', { name: '开始' }).click();
  await expect(page.getByText(`倒计时结束：${THEME} 1 分，已存档`)).toBeVisible({ timeout: 75_000 });
  await expect(card.getByRole('button', { name: '开始' })).toBeVisible();
  await expect(card.getByTestId('focus-totals')).toContainText('今天 1 分');
});

test('桌面小窗：显示提醒条目，可以直接开始、结束专注，满两小时提醒', async ({ page, request }) => {
  // 已经逾期的里程碑会出现在提醒里
  const themes = (await (await request.get('/api/themes')).json()) as { id: number; title: string }[];
  const theme = themes.find((t) => t.title === THEME)!;
  const project = await post<{ id: number }>(request, '/projects', {
    title: '小窗提醒课题',
    themeId: theme.id,
    status: 'active',
  });
  const yesterday = new Date(Date.now() - 86_400_000);
  const due = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  await post(request, `/projects/${project.id}/milestones`, { title: '小窗里的里程碑', dueDate: due });
  const checks = (await (await request.get('/api/checks')).json()) as { issues: { title: string }[] };

  await page.clock.install();
  await page.goto('/widget');
  const issues = page.getByTestId('widget-issues');
  await expect(issues.getByTestId('widget-issue').first()).toHaveText(checks.issues[0]!.title);
  await expect(issues).toContainText(`全部 ${checks.issues.length} 条`);
  // 小窗只列前 3 条（紧急的在前）
  await expect(issues.getByTestId('widget-issue')).toHaveCount(Math.min(3, checks.issues.length));
  if (checks.issues.slice(0, 3).some((i) => i.title.includes('小窗里的里程碑'))) {
    await expect(issues).toContainText('小窗里的里程碑');
  }

  // 在小窗里开始正计时
  const focus = page.getByTestId('widget-focus');
  await focus.getByLabel('专注的议题').selectOption({ label: THEME });
  await focus.getByRole('button', { name: '开始' }).click();
  await expect(focus.getByTestId('focus-clock')).toHaveAttribute('aria-label', /^已专注/);
  await expect(page).toHaveTitle('科研小助理 · 今天');

  // 满两小时：小窗里出现提醒，标题带"提醒"（桌面应用据此把小窗提到最上层），但不会自动停止
  await page.clock.fastForward('02:00:05');
  const reminder = focus.getByTestId('focus-reminder');
  await expect(reminder).toContainText('已经连续专注 2 小时');
  await expect(page).toHaveTitle('科研小助理 · 提醒');
  await expect(focus.getByRole('button', { name: '结束并存档' })).toBeVisible();
  await reminder.getByRole('button', { name: '知道了' }).click();
  await expect(reminder).toHaveCount(0);
  await expect(page).toHaveTitle('科研小助理 · 今天');

  await focus.getByRole('button', { name: '结束并存档' }).click();
  await expect(page.getByText(new RegExp(`已存档：${THEME}`))).toBeVisible();
  await expect(focus.getByRole('button', { name: '开始' })).toBeVisible();
});
