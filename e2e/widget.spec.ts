import { expect, test, type APIRequestContext } from '@playwright/test';

// 桌面小窗页面（/widget）：没有侧栏，显示今天最重要的事，可以直接打勾。

function localDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function send<T>(request: APIRequestContext, method: 'post' | 'put', path: string, data: unknown) {
  const res = await request[method](`/api${path}`, { data });
  expect(res.ok()).toBe(true);
  return (await res.json()) as T;
}

test('小窗显示今天最重要的事，打勾后任务完成', async ({ page, request }) => {
  const theme = await send<{ id: number }>(request, 'post', '/themes', { title: '小窗测试议题' });
  const task = await send<{ id: number }>(request, 'post', '/tasks', {
    title: '小窗里的要事',
    themeId: theme.id,
  });
  await send(request, 'put', `/days/${localDate()}/plan`, { topTaskIds: [task.id] });

  await page.goto('/widget');
  await expect(page.getByRole('navigation', { name: '主导航' })).toHaveCount(0);
  const list = page.getByTestId('widget-tasks');
  await expect(list).toHaveAccessibleName('今天最重要的事');
  await expect(list).toContainText('小窗里的要事');

  await list.getByRole('checkbox', { name: '标记为完成：小窗里的要事' }).click();
  await expect(list.getByRole('checkbox', { name: '标记为未完成：小窗里的要事' })).toBeChecked();
  const saved = await (await request.get(`/api/tasks/${task.id}`)).json();
  expect(saved.status).toBe('done');

  // "打开"是指向今日页的新窗口链接，桌面应用会把它转成打开主窗口。
  await expect(page.getByRole('link', { name: '打开' })).toHaveAttribute('href', '/today');
});
