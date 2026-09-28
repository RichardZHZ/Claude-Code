import { expect, test } from '@playwright/test';

test('侧栏显示最近一次备份，可以立即备份', async ({ page, request }) => {
  await page.goto('/today');
  const status = page.getByTestId('backup-status');
  // 服务启动时会自动备份一次。
  await expect(status).toContainText('上次备份：今天');

  const before = (await (await request.get('/api/backups')).json()) as { items: unknown[] };
  await status.getByRole('button', { name: '立即备份' }).click();
  await expect(page.getByText('已备份数据库')).toBeVisible();
  const after = (await (await request.get('/api/backups')).json()) as { items: { reason: string }[] };
  expect(after.items).toHaveLength(before.items.length + 1);
  expect(after.items[0]?.reason).toBe('manual');
});
