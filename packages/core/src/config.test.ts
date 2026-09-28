import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultDataDir, resolveBackupConfig } from './config.ts';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('默认数据目录', () => {
  it('按系统放在用户自己的数据目录', () => {
    expect(defaultDataDir('darwin', {}, '/Users/me')).toBe(
      '/Users/me/Library/Application Support/ResearchPilot',
    );
    expect(defaultDataDir('win32', { APPDATA: 'C:\\Users\\me\\AppData\\Roaming' }, 'C:\\Users\\me')).toBe(
      'C:\\Users\\me\\AppData\\Roaming\\ResearchPilot',
    );
    expect(defaultDataDir('linux', {}, '/home/me')).toBe('/home/me/.local/share/researchpilot');
    expect(defaultDataDir('linux', { XDG_DATA_HOME: '/data/xdg' }, '/home/me')).toBe(
      '/data/xdg/researchpilot',
    );
  });
});

describe('备份设置', () => {
  it('默认在数据库旁边的 backups/，每 24 小时一次，保留 30 份', () => {
    expect(resolveBackupConfig('/x/researchpilot.db')).toEqual({
      dir: '/x/backups',
      keep: 30,
      intervalHours: 24,
      auto: true,
    });
  });

  it('读取环境变量，忽略不合法的数字', () => {
    vi.stubEnv('BACKUP_DIR', '/b');
    vi.stubEnv('BACKUP_KEEP', '7');
    vi.stubEnv('BACKUP_INTERVAL_HOURS', 'abc');
    vi.stubEnv('AUTO_BACKUP', 'off');
    expect(resolveBackupConfig('/x/researchpilot.db')).toEqual({
      dir: '/b',
      keep: 7,
      intervalHours: 24,
      auto: false,
    });
  });
});
