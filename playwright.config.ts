import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// 端到端测试使用独立端口和一次性的临时数据库，不影响日常使用的数据。
const API_PORT = 8799;
const WEB_PORT = 5199;
const ZOTERO_PORT = 23199;
const dbPath = join(tmpdir(), `researchpilot-e2e-${Date.now()}.db`);

export default defineConfig({
  testDir: 'e2e',
  // 所有用例共享同一个数据库，按顺序执行。
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    locale: 'zh-CN',
    trace: 'retain-on-failure',
    // 可用 PW_CHROMIUM_PATH 指定本机已安装的 Chromium。
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // 假 Zotero：让"从 Zotero 添加文献"可以在没有 Zotero 的环境里测试。
      command: 'pnpm --filter @researchpilot/mcp exec tsx ../../e2e/fake-zotero-server.ts',
      url: `http://127.0.0.1:${ZOTERO_PORT}/api/users/0/items/top`,
      env: { PORT: String(ZOTERO_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @researchpilot/api start',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: { DB_PATH: dbPath, PORT: String(API_PORT), ZOTERO_URL: `http://127.0.0.1:${ZOTERO_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @researchpilot/web dev',
      url: `http://localhost:${WEB_PORT}`,
      env: { API_PORT: String(API_PORT), WEB_PORT: String(WEB_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
