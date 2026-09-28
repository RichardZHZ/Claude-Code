import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, runMigrations } from '@researchpilot/core';
import type { BackupInfoDto, BackupStatusDto } from '@researchpilot/core/contracts';
import { createApp } from './app.ts';
import { hasWebBuild, withWeb } from './web.ts';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'rp-api-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function makeApp() {
  const db = openDb(':memory:');
  runMigrations(db);
  const backup = { dir: join(tmp, 'backups'), keep: 2, intervalHours: 24, auto: true };
  return createApp({ db, backup, today: () => '2026-09-28' });
}

describe('备份接口', () => {
  it('立即备份后状态里能看到，并按保留份数清理', async () => {
    const app = makeApp();
    const empty = (await (await app.request('/api/backups')).json()) as BackupStatusDto;
    expect(empty).toMatchObject({ latest: null, items: [], keep: 2, auto: true, overdue: false });

    const created: BackupInfoDto[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await app.request('/api/backups', { method: 'POST' });
      expect(res.status).toBe(201);
      created.push((await res.json()) as BackupInfoDto);
    }
    expect(created[0]!.reason).toBe('manual');

    const status = (await (await app.request('/api/backups')).json()) as BackupStatusDto;
    expect(status.items.map((b) => b.file)).toEqual([created[2]!.file, created[1]!.file]);
    expect(status.latest?.file).toBe(created[2]!.file);
    expect(typeof status.latest?.createdAt).toBe('string');
  });
});

describe('托管前端页面', () => {
  function makeDist() {
    const dist = join(tmp, 'dist');
    mkdirSync(join(dist, 'assets'), { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>科研小助理</title>');
    writeFileSync(join(dist, 'assets', 'app-abc123.js'), 'console.log(1)');
    writeFileSync(join(dist, 'favicon.svg'), '<svg/>');
    return dist;
  }

  it('识别构建产物是否存在', () => {
    expect(hasWebBuild(join(tmp, 'nope'))).toBe(false);
    expect(hasWebBuild(makeDist())).toBe(true);
  });

  it('首页、页面路径返回 index.html，静态文件原样返回', async () => {
    const app = withWeb(makeApp(), makeDist());

    for (const path of ['/', '/week', '/projects/3']) {
      const res = await app.request(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(res.headers.get('cache-control')).toBe('no-cache');
      expect(await res.text()).toContain('科研小助理');
    }

    const js = await app.request('/assets/app-abc123.js');
    expect(js.status).toBe(200);
    expect(js.headers.get('cache-control')).toContain('immutable');
    expect(await js.text()).toBe('console.log(1)');

    expect((await app.request('/favicon.svg')).status).toBe(200);
    expect((await app.request('/assets/missing.js')).status).toBe(404);
    expect((await app.request('/week', { method: 'POST' })).status).toBe(404);
  });

  it('接口照常工作，不存在的接口返回 JSON 404', async () => {
    const app = withWeb(makeApp(), makeDist());
    const health = await app.request('/api/health');
    expect(await health.json()).toMatchObject({ ok: true, week: '2026-W40' });

    const missing = await app.request('/api/nope');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: '未找到该接口' });

    const bad = await app.request('/api/themes', {
      method: 'POST',
      body: '{',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: '请求内容不是合法的 JSON' });
  });
});
