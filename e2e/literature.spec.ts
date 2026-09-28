import { expect, test } from '@playwright/test';

// 第三阶段：从 Zotero（测试里是假 Zotero）关联文献、添加链接，并在本周页看到本周的文献。

test.describe.configure({ mode: 'serial' });

const PROJECT = '热岛与居民健康';
let projectId: number;

test.beforeAll(async ({ request }) => {
  const res = await request.post('/api/projects', { data: { title: PROJECT } });
  expect(res.ok()).toBe(true);
  projectId = ((await res.json()) as { id: number }).id;
});

test('在课题页从 Zotero 搜索并关联文献', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await page.goto(`/projects/${projectId}`);
  const panel = page.getByTestId('project-resources');
  await expect(panel.getByText('还没有关联文献或链接。')).toBeVisible();

  await panel.getByRole('button', { name: '从 Zotero 添加文献' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('搜索 Zotero').fill('heat');
  await dialog.getByRole('button', { name: '搜索' }).click();
  const results = dialog.getByTestId('zotero-item');
  await expect(results).toHaveCount(2);
  // 笔记不算文献，不会出现在结果里
  await expect(dialog.getByText('读书笔记')).toHaveCount(0);

  await dialog.getByRole('button', { name: '关联：The energetic basis of the urban heat island' }).click();
  await expect(
    dialog.getByRole('button', { name: '已关联：The energetic basis of the urban heat island' }),
  ).toBeDisabled();
  await page.keyboard.press('Escape');

  const item = panel.getByTestId('resource-item').filter({ hasText: 'The energetic basis' });
  await expect(item).toContainText('Oke (1982)');
  await expect(item.getByRole('link', { name: '在 Zotero 中打开' })).toHaveAttribute(
    'href',
    'zotero://select/library/items/OKE1982A',
  );
  await expect(item.getByRole('link', { name: 'DOI' })).toHaveAttribute(
    'href',
    'https://doi.org/10.1002/qj.49710845502',
  );

  // 课题动态里记了一笔
  await expect(page.getByTestId('activity-feed').getByText(/关联文献"Oke \(1982\)/)).toBeVisible();
});

test('添加和移除链接', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await page.goto(`/projects/${projectId}`);
  const panel = page.getByTestId('project-resources');
  await panel.getByRole('button', { name: '添加链接' }).click();
  await panel.getByLabel('链接名称').fill('Overleaf 初稿');
  await panel.getByLabel('链接地址').fill('https://www.overleaf.com/project/abc');
  await panel.getByRole('button', { name: '添加', exact: true }).click();
  const link = panel.getByRole('link', { name: 'Overleaf 初稿' });
  await expect(link).toHaveAttribute('href', 'https://www.overleaf.com/project/abc');

  await panel.getByTestId('resource-item').filter({ hasText: 'Overleaf 初稿' }).hover();
  await panel.getByRole('button', { name: '移除：Overleaf 初稿' }).click();
  await expect(link).toHaveCount(0);
});

test('本周关联的文献出现在本周页', async ({ page }) => {
  await page.goto('/week');
  const literature = page.getByTestId('week-progress').getByTestId('week-literature');
  await expect(literature).toContainText('Oke (1982) The energetic basis of the urban heat island');
});
