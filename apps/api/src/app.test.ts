import { describe, expect, it } from 'vitest';
import { openDb, runMigrations } from '@researchpilot/core';
import { createApp } from './app.ts';

function makeApp() {
  const db = openDb(':memory:');
  runMigrations(db);
  return createApp({ db, today: () => '2026-09-28' });
}

describe('API', () => {
  it('GET /api/health 返回数据库状态和当前周', async () => {
    const res = await makeApp().request('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, today: '2026-09-28', week: '2026-W40' });
  });

  it('未知路由返回 404 JSON', async () => {
    const res = await makeApp().request('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: '未找到该接口' });
  });
});
