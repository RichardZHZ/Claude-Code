// 桌面小窗：一个无边框的小窗口，显示网页的 /widget 页面（今天最重要的事）。
// macOS 上默认放在"普通窗口之下、桌面图标之上"的层级：像贴在桌面上，不会挡住其他窗口，但仍然可以点。
// 也可以固定在最上层，像便利贴一样浮在所有窗口上面。

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, Menu, screen, type Rectangle } from 'electron';

export type WidgetState = {
  visible: boolean;
  /** 固定在所有窗口上面。 */
  pinned: boolean;
  bounds?: Rectangle;
};

const DEFAULT_STATE: WidgetState = { visible: true, pinned: false };
/** 顶部倒计时加上三五件事的高度。 */
const DEFAULT_SIZE = { width: 300, height: 340 };
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
  private saveTimer: NodeJS.Timeout | undefined;

  constructor(private readonly options: WidgetOptions) {
    this.state = this.load();
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
      maxHeight: 720,
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

    const remember = () => {
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => {
        if (!win.isDestroyed()) this.update({ bounds: win.getBounds() }, false);
      }, 400);
    };
    win.on('move', remember);
    win.on('resize', remember);
    win.on('closed', () => {
      if (this.win === win) this.win = null;
    });
    // 小窗不抢焦点：出现时不打断正在用的应用。
    win.once('ready-to-show', () => win.showInactive());
    void win.loadURL(`${this.options.serverUrl()}/widget`);
    return win;
  }

  /** macOS：不固定时放在普通窗口下面一层（桌面图标之上）；其他系统没有这一层，就当普通窗口。 */
  private applyLevel(win: BrowserWindow) {
    if (this.state.pinned) win.setAlwaysOnTop(true, 'floating');
    else if (process.platform === 'darwin') win.setAlwaysOnTop(true, 'normal', -1);
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
    if (saved) {
      const area = screen.getDisplayMatching(saved).workArea;
      const visible =
        saved.x < area.x + area.width - 40 &&
        saved.x + saved.width > area.x + 40 &&
        saved.y >= area.y - 10 &&
        saved.y < area.y + area.height - 40;
      if (visible) return saved;
    }
    const area = screen.getPrimaryDisplay().workArea;
    return {
      ...DEFAULT_SIZE,
      x: area.x + area.width - DEFAULT_SIZE.width - MARGIN,
      y: area.y + MARGIN,
    };
  }

  private update(patch: Partial<WidgetState>, notify = true) {
    this.state = { ...this.state, ...patch };
    try {
      writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2));
    } catch {
      // 记不住位置也不影响使用。
    }
    if (notify) this.options.onChange();
  }

  private load(): WidgetState {
    try {
      return {
        ...DEFAULT_STATE,
        ...(JSON.parse(readFileSync(this.stateFile, 'utf8')) as Partial<WidgetState>),
      };
    } catch {
      return DEFAULT_STATE;
    }
  }
}
