// 桌面小窗：一个无边框的小窗口，显示网页的 /widget 页面（倒计时、专心致志、提醒、今天最重要的事）。
// 默认是普通窗口的层级，像贴在桌面上：出现时不抢焦点，用其他程序时会被它们的窗口盖住，
// 不会浮在上面。也可以在右键菜单里"固定在最上层"，像便利贴一样浮在所有窗口上面。
// 提醒（专注满两小时、倒计时结束）靠系统通知送达，不会改变小窗的层级。

import { join } from 'node:path';
import { app, BrowserWindow, Menu, screen, type Rectangle } from 'electron';
import { isOnScreen, readJson, trackBounds, writeJson } from './window-state.ts';

export type WidgetState = {
  visible: boolean;
  /** 固定在所有窗口上面。 */
  pinned: boolean;
  bounds?: Rectangle;
};

const DEFAULT_STATE: WidgetState = { visible: true, pinned: false };
/** 倒计时、专心致志、提醒和三五件事的高度。 */
const DEFAULT_SIZE = { width: 320, height: 620 };
const MARGIN = 24;

export type WidgetOptions = {
  /** 内置服务的地址，例如 http://127.0.0.1:8787 */
  serverUrl: () => string;
  /** 在主窗口里打开某个页面（例如 /today）。 */
  openMain: (path: string) => void;
  openExternally: (url: string) => void;
  /** 小窗显示、隐藏或固定状态变化后调用，用来刷新菜单里的勾选状态。 */
  onChange: () => void;
};

export class DesktopWidget {
  private win: BrowserWindow | null = null;
  private state: WidgetState;
  private readonly stateFile = join(app.getPath('userData'), 'desktop-widget.json');

  constructor(private readonly options: WidgetOptions) {
    this.state = readJson(this.stateFile, DEFAULT_STATE);
  }

  /** 小窗是否开着（按用户的选择，不受窗口还在加载的影响）。 */
  get visible(): boolean {
    return this.state.visible;
  }

  get pinned(): boolean {
    return this.state.pinned;
  }

  /** 启动时按上次的状态决定是否显示。 */
  restore() {
    if (this.state.visible) this.show();
  }

  show() {
    if (!this.win) this.win = this.create();
    else this.win.showInactive();
    this.update({ visible: true });
  }

  hide() {
    this.win?.hide();
    this.update({ visible: false });
  }

  toggle() {
    if (this.visible) this.hide();
    else this.show();
  }

  setPinned(pinned: boolean) {
    this.update({ pinned });
    if (this.win) this.applyLevel(this.win);
  }

  private create(): BrowserWindow {
    const win = new BrowserWindow({
      ...this.initialBounds(),
      minWidth: 240,
      minHeight: 200,
      maxWidth: 560,
      maxHeight: 1000,
      title: '科研小助理 · 今天',
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      show: false,
      webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    this.applyLevel(win);
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    if (process.platform === 'darwin') win.setHiddenInMissionControl(true);

    // 小窗里的链接：本应用的页面在主窗口打开，外部链接交给系统。
    const route = (url: string) => {
      if (url.startsWith(this.options.serverUrl())) this.options.openMain(new URL(url).pathname);
      else this.options.openExternally(url);
    };
    win.webContents.setWindowOpenHandler(({ url }) => {
      route(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (event, url) => {
      event.preventDefault();
      route(url);
    });
    win.webContents.on('context-menu', () => this.contextMenu().popup({ window: win }));
    // 窗口标题固定，不随页面变化。
    win.on('page-title-updated', (event) => event.preventDefault());

    trackBounds(win, () => this.update({ bounds: win.getBounds() }, false));
    win.on('closed', () => {
      if (this.win === win) this.win = null;
    });
    // 小窗不抢焦点：出现时不打断正在用的应用。显示之后再设一次层级，
    // 避免显示窗口时被系统改回别的层级。
    win.once('ready-to-show', () => {
      win.showInactive();
      this.applyLevel(win);
    });
    void win.loadURL(`${this.options.serverUrl()}/widget`);
    return win;
  }

  /** 固定时浮在所有窗口上面；否则就是普通窗口，用其他程序时被它们盖住。 */
  private applyLevel(win: BrowserWindow) {
    if (this.state.pinned) win.setAlwaysOnTop(true, 'floating');
    else win.setAlwaysOnTop(false);
  }

  private contextMenu() {
    return Menu.buildFromTemplate([
      { label: '打开科研小助理', click: () => this.options.openMain('/today') },
      { label: '刷新', click: () => this.win?.webContents.reload() },
      { type: 'separator' },
      {
        label: '固定在最上层',
        type: 'checkbox',
        checked: this.state.pinned,
        click: () => this.setPinned(!this.state.pinned),
      },
      { label: '隐藏小窗', click: () => this.hide() },
      { type: 'separator' },
      { label: '退出科研小助理', click: () => app.quit() },
    ]);
  }

  /** 上次的位置还在某块屏幕上就沿用，否则放在主屏幕右上角。 */
  private initialBounds(): Rectangle {
    const saved = this.state.bounds;
    if (saved && isOnScreen(saved)) return saved;
    const area = screen.getPrimaryDisplay().workArea;
    return {
      width: DEFAULT_SIZE.width,
      height: Math.min(DEFAULT_SIZE.height, area.height - 2 * MARGIN),
      x: area.x + area.width - DEFAULT_SIZE.width - MARGIN,
      y: area.y + MARGIN,
    };
  }

  private update(patch: Partial<WidgetState>, notify = true) {
    this.state = { ...this.state, ...patch };
    writeJson(this.stateFile, this.state);
    if (notify) this.options.onChange();
  }
}
