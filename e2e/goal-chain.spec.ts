import { expect, test, type Page } from '@playwright/test';

// 完整走一遍目标链：议题 → 课题 → 里程碑 → 任务 → 本周 → 今天 → 完成 → 复盘，
// 再从收件箱把一条想法升级为议题下的任务。

test.describe.configure({ mode: 'serial' });

const THEME = '城市热岛效应';
const PROJECT = '热岛与健康论文';

function taskItem(page: Page, title: string) {
  return page.getByTestId('task-item').filter({ hasText: title });
}

test('议题 → 课题 → 任务 → 本周 → 今天 → 完成', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());

  // 1. 从空白的议题地图开始，新建议题
  await page.goto('/map');
  await expect(page.getByText('从一个研究议题开始')).toBeVisible();
  await page.getByRole('button', { name: '新建第一个议题' }).click();
  const themeDialog = page.getByRole('dialog');
  await themeDialog.getByLabel('名称').fill(THEME);
  await themeDialog.getByLabel('核心问题').fill('热岛强度与居民健康有什么关系？\n哪些绿化措施最有效？');
  await themeDialog.getByRole('button', { name: '创建' }).click();
  const themeCard = page.getByTestId('theme-card').filter({ hasText: THEME });
  await expect(themeCard).toBeVisible();
  await expect(themeCard.getByText('哪些绿化措施最有效？')).toBeVisible();

  // 2. 在议题下新建课题
  await themeCard.getByRole('button', { name: `在"${THEME}"下新建课题` }).click();
  const projectDialog = page.getByRole('dialog');
  await projectDialog.getByLabel('名称').fill(PROJECT);
  await expect(projectDialog.getByLabel('所属议题')).toHaveValue(/\d+/);
  await projectDialog.getByRole('button', { name: '创建' }).click();
  await expect(themeCard.getByRole('link', { name: PROJECT })).toBeVisible();

  // 3. 进入课题：加里程碑和任务
  await themeCard.getByRole('link', { name: PROJECT }).click();
  await expect(page.getByRole('heading', { name: PROJECT })).toBeVisible();
  await page.getByLabel('新里程碑名称').fill('完成数据分析');
  await page.getByTestId('milestones').getByRole('button', { name: '添加' }).click();
  await expect(page.getByTestId('milestones').getByText('完成数据分析')).toBeVisible();

  const todoColumn = page.getByTestId('column-todo');
  for (const title of ['清洗气象数据', '跑回归模型', '画热力图']) {
    await todoColumn.getByLabel('课题的新任务').fill(title);
    await todoColumn.getByRole('button', { name: '添加' }).click();
    await expect(taskItem(page, title)).toBeVisible();
  }

  // 4. 用菜单切换状态
  await page.getByRole('button', { name: '任务操作：跑回归模型' }).click();
  await page.getByRole('menuitem', { name: '进行中' }).click();
  await expect(page.getByTestId('column-doing').getByText('跑回归模型')).toBeVisible();

  // 5. 拖动卡片切换状态
  await taskItem(page, '画热力图').dragTo(page.getByTestId('column-blocked'));
  await expect(page.getByTestId('column-blocked').getByText('画热力图')).toBeVisible();

  // 6. 加入本周，并写下本周重点
  await page.getByRole('button', { name: '任务操作：清洗气象数据' }).click();
  await page.getByRole('menuitem', { name: '加入本周' }).click();
  await page.getByRole('link', { name: '本周' }).click();
  await expect(page.getByTestId('week-tasks').getByText('清洗气象数据')).toBeVisible();
  await expect(page.getByTestId('backlog').getByText('跑回归模型')).toBeVisible();
  await page.getByLabel('本周重点').fill('完成数据清洗\n确定回归设定');
  await page.getByRole('button', { name: '保存重点' }).click();
  await expect(page.getByTestId('week-focus').getByRole('listitem')).toHaveText([
    '完成数据清洗',
    '确定回归设定',
  ]);

  // 7. 今天：从本周任务池挑为最重要的事，然后完成
  await page.getByRole('link', { name: '今日' }).click();
  await expect(page.getByTestId('week-pool').getByText('清洗气象数据')).toBeVisible();
  await page.getByRole('button', { name: '设为重点：清洗气象数据' }).click();
  const top = page.getByTestId('top-tasks');
  await expect(top.getByText('清洗气象数据')).toBeVisible();
  await expect(page.getByTestId('week-pool').getByText('清洗气象数据')).toHaveCount(0);

  await top.getByRole('checkbox', { name: '标记为完成：清洗气象数据' }).click();
  await expect(top.getByRole('checkbox', { name: '标记为未完成：清洗气象数据' })).toBeChecked();

  // 8. 工作日志与晚间复盘
  await page.getByLabel('工作日志').fill('上午清洗完气象站数据，缺失值用邻近站点插补。');
  await page.getByRole('button', { name: '保存日志' }).click();
  await expect(page.getByRole('button', { name: '已保存' })).toBeVisible();

  const review = page.getByTestId('day-review');
  await review.getByLabel('今天完成了什么').fill('数据清洗');
  await review.getByLabel('明天先做什么').fill('跑回归');
  await review.getByRole('button', { name: '保存复盘' }).click();
  await expect(review.getByText(/已于 \d{2}:\d{2} 复盘/)).toBeVisible();

  // 9. 回到议题地图，进度已更新（3 个任务完成 1 个）
  await page.getByRole('link', { name: '议题地图' }).click();
  await expect(
    page.getByTestId('project-row').filter({ hasText: PROJECT }).getByText('1/3 · 33%'),
  ).toBeVisible();

  // 刷新后数据仍在（确实写进了数据库）
  await page.goto('/today');
  await expect(page.getByTestId('top-tasks').getByText('清洗气象数据')).toBeVisible();
  await expect(page.getByLabel('工作日志')).toHaveValue('上午清洗完气象站数据，缺失值用邻近站点插补。');
});

test('收件箱：随手记 → 转为议题下的任务', async ({ page }) => {
  await page.goto('/today');
  await page.getByLabel('随手记').fill('读一篇城市热岛的经典综述');
  await page.getByRole('button', { name: '记下' }).click();
  await expect(page.getByRole('link', { name: /收件箱/ }).getByLabel('1 条待处理')).toBeVisible();

  await page.getByRole('link', { name: /收件箱/ }).click();
  const item = page.getByTestId('inbox-item').filter({ hasText: '读一篇城市热岛的经典综述' });
  await item.getByRole('button', { name: '转为任务' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('归属').selectOption({ label: THEME });
  await dialog.getByRole('button', { name: '确定' }).click();

  await expect(page.getByTestId('inbox-pending').getByText('收件箱是空的。')).toBeVisible();
  await expect(page.getByTestId('inbox-processed').getByText('→ 已转为任务')).toBeVisible();

  // 任务出现在议题下，也因为勾选了"排进本周"而出现在本周
  await page.getByRole('link', { name: '议题地图' }).click();
  await expect(page.getByTestId('theme-card').getByText('读一篇城市热岛的经典综述')).toBeVisible();
  await page.getByRole('link', { name: '本周' }).click();
  await expect(page.getByTestId('week-tasks').getByText('读一篇城市热岛的经典综述')).toBeVisible();
});
