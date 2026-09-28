// 桌面应用的主进程：在后台启动内置的服务，再用独立窗口打开页面，不经过浏览器。
// 服务跑在子进程里（用 Electron 自带的 Node），崩溃不会拖垮窗口，退出时也能好好关闭数据库。

import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  shell,
  type MenuItemConstructorOptions,
} from 'electron';
import { DEFAULT_DB_PATH } from '@researchpilot/core/config';
import { DesktopWidget } from './widget.ts';

const APP_TITLE = '科研小助理';
/** 优先用这个端口，这样日历订阅地址保持不变；被占用时换一个空闲端口。 */
const PREFERRED_PORT = 8787;

const dbPath = process.env.DB_PATH ?? DEFAULT_DB_PATH;
const dataDir = dirname(dbPath);
const logDir = join(dataDir, 'logs');
const logFile = join(logDir, 'desktop.log');

/** 打包后代码、页面和迁移都在应用目录里；开发时从仓库里找。 */
const appRoot = app.getAppPath();
const paths = app.isPackaged
  ? {
      server: join(appRoot, 'dist', 'server.mjs'),
      mcp: join(appRoot, 'dist', 'mcp.mjs'),
      web: join(appRoot, 'web'),
      migrations: join(appRoot, 'drizzle'),
    }
  : {
      server: join(appRoot, 'dist', 'server.mjs'),
      mcp: join(appRoot, 'dist', 'mcp.mjs'),
      web: resolve(appRoot, '../web/dist'),
      migrations: resolve(appRoot, '../../packages/core/drizzle'),
    };

let server: ChildProcess | null = null;
let serverUrl = '';
let mainWindow: BrowserWindow | null = null;
let widget: DesktopWidget | null = null;
let quitting = false;
const isMac = process.platform === 'darwin';

function log(message: string) {
  try {
    mkdirSync(logDir, { recursive: true });
    appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // 写不了日志也不影响使用。
  }
}

function canListen(port: number): Promise<number | null> {
  return new Promise((done) => {
    const probe = createServer();
    probe.once('error', () => done(null));
    probe.listen(port, '127.0.0.1', () => {
      const address = probe.address();
      const actual = typeof address === 'object' && address ? address.port : null;
      probe.close(() => done(actual));
    });
  });
}

async function pickPort(): Promise<number> {
  return (await canListen(PREFERRED_PORT)) ?? (await canListen(0)) ?? PREFERRED_PORT;
}

/**
 * 运行打包好的 Node 脚本。打包后用 Electron 自带的 Node（ELECTRON_RUN_AS_NODE），
 * 开发时用系统的 node，因为仓库里的 better-sqlite3 是按系统 Node 编译的。
 */
function runNodeScript(script: string, env: Record<string, string>) {
  const command = app.isPackaged ? process.execPath : 'node';
  return spawn(command, [script], {
    env: { ...process.env, ...env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function waitForHealth(url: string, child: ChildProcess, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`服务启动失败（退出码 ${child.exitCode}）`);
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
    } catch {
      // 还没开始监听，稍后再试。
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error('服务在 30 秒内没有启动');
}

async function startServer(): Promise<string> {
  const port = await pickPort();
  const child = runNodeScript(paths.server, {
    HOST: '127.0.0.1',
    PORT: String(port),
    DB_PATH: dbPath,
    WEB_DIST: paths.web,
    MIGRATIONS_DIR: paths.migrations,
    LOG_REQUESTS: 'off',
  });
  server = child;
  child.stdout?.on('data', (chunk: Buffer) => log(chunk.toString().trimEnd()));
  child.stderr?.on('data', (chunk: Buffer) => log(chunk.toString().trimEnd()));
  child.on('exit', (code, signal) => {
    log(`服务已退出：code=${code} signal=${signal}`);
    server = null;
    if (!quitting) {
      dialog.showErrorBox(APP_TITLE, `后台服务意外停止，应用将退出。\n\n日志：${logFile}`);
      app.quit();
    }
  });
  const url = `http://127.0.0.1:${port}`;
  await waitForHealth(url, child);
  return url;
}

function stopServer(): Promise<void> {
  const child = server;
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((done) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      done();
    }, 5_000);
    child.once('exit', () => {
      clearTimeout(timer);
      done();
    });
    child.kill('SIGTERM');
  });
}

/** 应用内只显示自己的页面；外部链接交给系统打开（浏览器、Zotero、访达）。 */
function openExternally(url: string) {
  if (url.startsWith('file:')) void shell.openPath(fileURLToPath(url));
  else if (/^(https?|mailto|zotero):/i.test(url)) void shell.openExternal(url);
}

/** 显示主窗口；传入页面路径时切换到那个页面。 */
function showMain(path?: string) {
  if (!mainWindow) {
    createWindow(path ?? '/today');
    return;
  }
  if (path) void mainWindow.loadURL(`${serverUrl}${path}`);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow(path: string) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: APP_TITLE,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(serverUrl)) {
      event.preventDefault();
      openExternally(url);
    }
  });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  void win.loadURL(`${serverUrl}${path}`);
  mainWindow = win;
}

/** 让 Claude Code 直接使用应用内置的 MCP 服务器，和桌面应用读写同一份数据。 */
function mcpCommand(): string {
  const q = (s: string) => `"${s.replace(/(["\\$`])/g, '\\$1')}"`;
  const node = app.isPackaged ? process.execPath : 'node';
  return `claude mcp add --scope user researchpilot -e ELECTRON_RUN_AS_NODE=1 -- ${q(node)} ${q(paths.mcp)}`;
}

function buildMenu() {
  const help: MenuItemConstructorOptions[] = [
    {
      label: '在 Claude Code 中使用…',
      click: () => {
        clipboard.writeText(mcpCommand());
        void dialog.showMessageBox({
          type: 'info',
          title: APP_TITLE,
          message: '已复制登记命令',
          detail:
            '在终端里粘贴并运行这条命令，之后在任何目录打开 Claude Code 都能使用科研小助理。\n\n' +
            '它和桌面应用读写同一份数据。移动了应用的位置后，需要重新复制并运行一次。',
        });
      },
    },
    { label: '打开数据文件夹', click: () => void shell.openPath(dataDir) },
    { label: '查看日志', click: () => void shell.openPath(logFile) },
  ];
  const loginItem = isMac || process.platform === 'win32';
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: APP_TITLE,
            submenu: [
              { role: 'about', label: `关于${APP_TITLE}` },
              { type: 'separator' },
              {
                label: '开机时自动打开',
                type: 'checkbox',
                checked: app.getLoginItemSettings().openAtLogin,
                click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
              },
              { type: 'separator' },
              { role: 'hide', label: `隐藏${APP_TITLE}` },
              { role: 'hideOthers', label: '隐藏其他' },
              { role: 'unhide', label: '全部显示' },
              { type: 'separator' },
              { role: 'quit', label: `退出${APP_TITLE}` },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : [
          {
            label: '文件',
            submenu: [
              ...(loginItem
                ? [
                    {
                      label: '开机时自动打开',
                      type: 'checkbox',
                      checked: app.getLoginItemSettings().openAtLogin,
                      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
                    } satisfies MenuItemConstructorOptions,
                    { type: 'separator' } satisfies MenuItemConstructorOptions,
                  ]
                : []),
              { role: 'quit', label: '退出' },
            ],
          } satisfies MenuItemConstructorOptions,
        ]),
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '拷贝' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '显示',
      submenu: [
        {
          label: '桌面小窗',
          type: 'checkbox',
          checked: widget?.visible ?? false,
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => widget?.toggle(),
        },
        {
          label: '小窗固定在最上层',
          type: 'checkbox',
          checked: widget?.pinned ?? false,
          enabled: widget?.visible ?? false,
          click: () => widget?.setPinned(!widget.pinned),
        },
        { type: 'separator' },
        { role: 'reload', label: '重新载入' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '窗口',
      role: 'window',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        ...(isMac ? [{ role: 'front', label: '前置全部窗口' } satisfies MenuItemConstructorOptions] : []),
        { role: 'close', label: '关闭窗口' },
      ],
    },
    { label: '帮助', role: 'help', submenu: help },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setName(APP_TITLE);

  app.on('second-instance', () => {
    if (serverUrl) showMain();
  });

  app.whenReady().then(async () => {
    buildMenu();
    log(`启动：数据库 ${dbPath}`);
    try {
      serverUrl = await startServer();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(message);
      dialog.showErrorBox(APP_TITLE, `无法启动：${message}\n\n日志：${logFile}`);
      quitting = true;
      await stopServer();
      app.exit(1);
      return;
    }
    widget = new DesktopWidget({
      serverUrl: () => serverUrl,
      openMain: showMain,
      openExternally,
      onChange: buildMenu,
    });
    widget.restore();
    // 开机自动打开时只显示桌面小窗，不弹出主窗口（小窗关着的话仍打开主窗口）。
    const atLogin = isMac && app.getLoginItemSettings().wasOpenedAtLogin;
    if (!atLogin || !widget.visible) showMain();
    buildMenu();
    // macOS：关掉主窗口后应用仍在程序坞里（小窗也还在），点程序坞图标重新打开主窗口。
    app.on('activate', () => showMain());
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', (event) => {
    if (quitting) return;
    quitting = true;
    if (server) {
      event.preventDefault();
      void stopServer().then(() => app.quit());
    }
  });

  // 注销、关机或在终端里结束进程时，也先关掉后台服务。
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => app.quit());
}
