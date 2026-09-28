# 部署、备份与恢复

科研小助理是单用户的本地应用，所有数据只存在你自己的电脑上。有三种用法，任选其一：

| 方式 | 适合 | 启动 |
| --- | --- | --- |
| 桌面应用（推荐） | 日常使用，像普通软件一样双击打开，不经过浏览器 | 下载安装包 |
| 本机直接运行 | 已经装了 Node.js，想用最新代码 | `pnpm start`，浏览器打开 <http://localhost:8787> |
| Docker | 放在一台常开的机器上 | `docker compose up -d --build` |

## 数据放在哪里

桌面应用、`pnpm start`、`pnpm dev` 和 Claude 用的 MCP 服务器默认读写同一个数据库，数据只有一份：

| 系统 | 位置 |
| --- | --- |
| macOS | `~/Library/Application Support/ResearchPilot/` |
| Windows | `%APPDATA%\ResearchPilot\` |
| Linux | `~/.local/share/researchpilot/` |

目录里有数据库 `researchpilot.db`、备份文件夹 `backups/` 和桌面应用的日志 `logs/`。用环境变量 `DB_PATH` 可以换位置。桌面应用里点菜单"帮助 → 打开数据文件夹"可以直接打开它。

旧版本把数据库放在仓库的 `data/researchpilot.db`。如果你在那里已经有数据，先关掉程序，把这个文件复制到上面的目录即可。

## 桌面应用（macOS）

### 安装

1. 在 GitHub 仓库的 Releases 页面下载安装包。Apple 芯片（M1 及以后）的 Mac 选 `ResearchPilot-版本-arm64.dmg`，Intel 芯片的 Mac 选 `x64`。不确定的话，点左上角苹果菜单 → "关于本机"，看"芯片"一栏。
2. 双击 `.dmg`，把"科研小助理"拖进"应用程序"文件夹。
3. 第一次打开会被系统拦下，因为应用没有花钱购买 Apple 的开发者签名。任选一种方法放行，只需做一次：
   - 打开"系统设置 → 隐私与安全性"，在页面下方找到"已阻止打开科研小助理"，点"仍要打开"；
   - 或者在终端运行：`xattr -dr com.apple.quarantine "/Applications/科研小助理.app"`

之后就和普通应用一样，从启动台或程序坞打开。

### 使用

- 应用在后台启动内置的服务，窗口里直接显示页面，不需要浏览器，也不需要安装 Node.js。
- **桌面小窗**：屏幕右上角有一张贴在桌面上的小卡片。从上到下：
  - 议题倒计时（按秒跳动，最多显示 3 个）；
  - 专心致志：选议题、选正计时或倒计时，直接开始和结束。正计时每连续满 2 小时，小窗会临时浮到最上层并发一条系统通知，点"知道了"或结束后恢复；倒计时到点自动存档，同样会提醒；
  - 提醒条目（最多 3 条，紧急的在前）；
  - 今天最重要的事（还没挑的话显示排在今天的任务），可以直接打勾；
  - 底部是本周进度和今天的专注时间。
  - 0.4.0 起小窗内容变多，默认尺寸调到 320×620；旧版本记下的尺寸会自动放大一次。
  - 它在所有窗口的下面、桌面图标的上面，不会挡住正在用的应用；拖动标题栏或底栏可以移动，拖边缘可以调大小，位置会被记住。
  - 右键小窗：打开科研小助理、刷新、固定在最上层（像便利贴一样浮在所有窗口上面）、隐藏小窗。
  - 菜单"显示 → 桌面小窗"（⇧⌘D）可以随时打开或关掉。
  - 点"打开"或任务以外的链接，会在主窗口里打开对应页面。
- 应用菜单里勾选"开机时自动打开"，开机后小窗就在桌面上，不会弹出主窗口。
- 关掉窗口后应用仍在程序坞里，点一下重新打开；退出用 ⌘Q。
- 页面里的外部链接（DOI、Overleaf 等）在系统浏览器里打开，Zotero 条目在 Zotero 里打开。
- 自动备份照常进行，左下角显示上次备份的时间。
- 菜单"帮助"里有：在 Claude Code 中使用、打开数据文件夹、查看日志。

### 和 Claude 一起用

点菜单"帮助 → 在 Claude Code 中使用…"，会复制一条登记命令。在终端里粘贴运行一次，之后在任何目录打开 Claude Code 都能使用科研小助理，和桌面应用读写同一份数据。这条命令用应用自带的运行环境，同样不需要安装 Node.js。把应用移到别的位置后，需要重新复制并运行一次。

### 自己打包

需要 Node.js 22 和 pnpm。在仓库里运行：

```bash
pnpm install
pnpm desktop                                     # 不打包，直接用开发版打开桌面窗口
pnpm desktop:package --mac --arch arm64,x64      # 生成 .dmg，在 apps/desktop/release/ 里
```

仓库里的 GitHub Actions（`.github/workflows/desktop.yml`）会在 macOS 机器上自动打包并试启动，每个拉取请求的运行结果里可以下载安装包。

发布新版本：
1. 把 `apps/desktop/package.json` 的 `version` 改成新版本号（例如 `0.2.0`），合并到主分支。
2. 在 GitHub 仓库的 Actions 页面选 "Desktop app" → "Run workflow"，分支选 `main`，版本号填 `v0.2.0`。也可以直接推送 `v0.2.0` 标签。
3. 打包完成后，安装包出现在 Releases 页面。版本号和 `package.json` 不一致时流程会报错，不会发布。

## 本机直接运行

```bash
pnpm install
pnpm start
```

`pnpm start` 会先构建网页，再启动服务，然后在浏览器里打开 <http://localhost:8787>。之后如果没改代码，可以跳过构建直接启动：`pnpm --filter @researchpilot/api start`。开发时用 `pnpm dev`（端口 5173，改代码自动刷新）。

### 开机自动启动（macOS）

用桌面应用的话，在"系统设置 → 通用 → 登录项"里添加"科研小助理"即可。用 `pnpm start` 的话，把下面的内容保存为 `~/Library/LaunchAgents/local.researchpilot.plist`，把 `/Users/you/Claude-Code` 换成仓库的实际位置：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>local.researchpilot</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd /Users/you/Claude-Code &amp;&amp; pnpm --filter @researchpilot/api start</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/researchpilot.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/researchpilot.log</string>
</dict>
</plist>
```

然后执行：

```bash
pnpm build                                                  # 先构建一次网页
launchctl load ~/Library/LaunchAgents/local.researchpilot.plist
```

更新代码后运行 `pnpm build`，再用 `launchctl kickstart -k gui/$(id -u)/local.researchpilot` 重启。不想自动启动了就 `launchctl unload` 同一个文件。

## Docker

```bash
docker compose up -d --build     # 构建镜像并在后台启动
docker compose logs -f           # 看日志
docker compose down              # 停止
```

- 只对本机开放（`127.0.0.1:8787`）。
- 数据库和备份默认在仓库的 `data/` 目录（容器里是 `/data`），和桌面应用的数据分开。想用同一份数据，启动前设置 `RESEARCHPILOT_DATA` 指向上面"数据放在哪里"的目录，例如 `RESEARCHPILOT_DATA="$HOME/Library/Application Support/ResearchPilot" docker compose up -d`，并且不要同时开着桌面应用。
- 容器以数据目录所有者的身份运行，所以里面的文件仍归你自己。
- 时区默认 `Asia/Shanghai`，决定"今天"是哪一天。在别的时区可以在启动前设置 `TZ`，例如 `TZ=Europe/Berlin docker compose up -d`。
- 容器自带健康检查，`docker compose ps` 能看到 `healthy`。
- 更新代码后重新执行 `docker compose up -d --build`。数据库结构有变化时会先自动备份再升级。

**Zotero**：容器通过 `host.docker.internal:23119` 访问宿主机上的 Zotero。Zotero 只接受来自本机的连接，在 macOS 和 Windows 的 Docker Desktop 上一般可以连通，在 Linux 上通常连不上。连不上时文献搜索会提示不可用，其他功能不受影响。经常用文献功能的话，建议用 `pnpm start` 本机运行。

## 备份

### 自动备份

桌面应用、网页服务（`pnpm start`、`pnpm dev`、Docker）和 Claude 用的 MCP 服务器运行时，都会每小时检查一次：距上次备份满 24 小时就备份一次，只保留最新 30 份。启动时也会检查一次，所以每天第一次打开就会备份。

另外两种情况会自动留一份：

- **升级前**：新版本需要改数据库结构时，先备份再升级。
- **恢复前**：用备份恢复时，先把当前数据库另存一份。

网页左下角显示上次备份的时间，点"立即备份"可以马上备份一次。太久没备份时这行字会变红。

备份是 SQLite 的在线备份，服务运行中也能得到完整一致的副本。每份备份是一个独立的 `.db` 文件，文件名带时间和原因，例如 `researchpilot-20260928-090000-scheduled.db`。

### 命令行

```bash
pnpm db:backup           # 立即备份一次
pnpm db:backup --list    # 列出已有备份
```

### 设置

| 变量 | 作用 | 默认 |
| --- | --- | --- |
| `BACKUP_DIR` | 备份目录 | 数据库旁边的 `backups/` |
| `BACKUP_KEEP` | 最多保留几份 | 30 |
| `BACKUP_INTERVAL_HOURS` | 自动备份间隔（小时） | 24 |
| `AUTO_BACKUP` | 设为 `off` 关闭自动备份 | 开启 |

想多一层保险，可以把 `BACKUP_DIR` 指到 iCloud Drive、Dropbox 等同步盘里的文件夹。不要把数据库本身（`DB_PATH`）放进同步盘：SQLite 在运行中会同时写几个文件，同步盘可能只同步了其中一部分。

## 恢复

1. 先停掉所有用到数据库的程序：桌面应用（⌘Q 退出）、网页服务，以及 Claude Code 里的 MCP 服务器（关掉 Claude Code，或在 `/mcp` 里停用 researchpilot）。
2. 找到要恢复的备份：`pnpm db:backup --list`。
3. 恢复（只写文件名即可，需要在仓库目录里、装有 Node.js）：

   ```bash
   pnpm db:restore researchpilot-20260928-090000-scheduled.db
   ```

4. 重新启动。

恢复前会检查文件确实是科研小助理的数据库，并把当前数据库另存为一份"恢复前备份"，恢复错了还能换回来。

只用桌面应用、没有装 Node.js 时，也可以手动恢复：退出应用，在数据文件夹里把 `researchpilot.db` 改名留作后备（同时删掉旁边的 `researchpilot.db-wal`、`researchpilot.db-shm`），再把要恢复的备份文件复制过来并改名为 `researchpilot.db`。

用 Docker 时：

```bash
docker compose stop
docker compose run --rm researchpilot node --import tsx /app/packages/core/src/scripts/backup.ts --list
docker compose run --rm researchpilot node --import tsx /app/packages/core/src/scripts/restore.ts researchpilot-20260928-090000-scheduled.db
docker compose up -d
```

## 换一台电脑

把数据目录里的 `researchpilot.db` 复制到新电脑的同一位置（见"数据放在哪里"），然后正常启动。复制前先退出应用，或者直接复制 `backups/` 里最新的备份文件并改名为 `researchpilot.db`，备份文件总是完整的。

## 暂不做的

- **Apple 开发者签名与公证**：需要每年付费的 Apple 开发者账号。没有签名时第一次打开要手动放行一次，见上文"安装"。
- **Windows 安装包**：打包脚本支持 `--win`，但还没有在 Windows 上验证过。
- **多设备同步（Litestream）**：Litestream 把 SQLite 持续复制到 S3 等对象存储，适合一台机器写、另一处只读或灾备，不能让两台电脑同时写同一个库。单人单机用上面的自动备份加同步盘已经够用。以后要在服务器上长期运行时再加。
