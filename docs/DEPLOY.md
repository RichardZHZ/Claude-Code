# 部署、备份与恢复

科研小助理是单用户的本地应用。日常使用有两种方式，任选其一：

| 方式 | 适合 | 启动 |
| --- | --- | --- |
| 本机直接运行 | 已经装了 Node.js；要用 Zotero 文献功能 | `pnpm start` |
| Docker | 不想在本机装 Node.js 和依赖 | `docker compose up -d --build` |

两种方式都在 <http://localhost:8787> 同时提供网页和接口，数据都在仓库的 `data/` 目录里，可以来回切换。开发时仍用 `pnpm dev`（端口 5173，改代码自动刷新）。

## 本机直接运行

```bash
pnpm install
pnpm start
```

`pnpm start` 会先构建网页，再启动服务。之后如果没改代码，可以跳过构建直接启动：`pnpm --filter @researchpilot/api start`。

### 开机自动启动（macOS）

把下面的内容保存为 `~/Library/LaunchAgents/local.researchpilot.plist`，把两处 `/Users/you/Claude-Code` 换成仓库的实际位置：

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
  <string>/Users/you/Claude-Code/data/server.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/you/Claude-Code/data/server.log</string>
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
- 数据库和备份在仓库的 `data/` 目录（容器里是 `/data`）。容器以 `data/` 目录所有者的身份运行，所以里面的文件仍归你自己。
- 时区默认 `Asia/Shanghai`，决定"今天"是哪一天。在别的时区可以在启动前设置 `TZ`，例如 `TZ=Europe/Berlin docker compose up -d`。
- 容器自带健康检查，`docker compose ps` 能看到 `healthy`。
- 更新代码后重新执行 `docker compose up -d --build`。数据库结构有变化时会先自动备份再升级。

**Zotero**：容器通过 `host.docker.internal:23119` 访问宿主机上的 Zotero。Zotero 只接受来自本机的连接，在 macOS 和 Windows 的 Docker Desktop 上一般可以连通，在 Linux 上通常连不上。连不上时文献搜索会提示不可用，其他功能不受影响。经常用文献功能的话，建议用 `pnpm start` 本机运行。

## 备份

### 自动备份

网页服务（`pnpm start`、`pnpm dev`、Docker）和 Claude 用的 MCP 服务器运行时，都会每小时检查一次：距上次备份满 24 小时就备份一次，只保留最新 30 份。启动时也会检查一次，所以每天第一次打开就会备份。

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
| `BACKUP_DIR` | 备份目录 | 数据库旁边的 `backups/`，即 `data/backups/` |
| `BACKUP_KEEP` | 最多保留几份 | 30 |
| `BACKUP_INTERVAL_HOURS` | 自动备份间隔（小时） | 24 |
| `AUTO_BACKUP` | 设为 `off` 关闭自动备份 | 开启 |

想多一层保险，可以把 `BACKUP_DIR` 指到 iCloud Drive、Dropbox 等同步盘里的文件夹。不要把数据库本身（`DB_PATH`）放进同步盘：SQLite 在运行中会同时写几个文件，同步盘可能只同步了其中一部分。

## 恢复

1. 先停掉所有用到数据库的程序：网页服务，以及 Claude Code 里的 MCP 服务器（关掉 Claude Code，或在 `/mcp` 里停用 researchpilot）。
2. 找到要恢复的备份：`pnpm db:backup --list`。
3. 恢复（只写文件名即可）：

   ```bash
   pnpm db:restore researchpilot-20260928-090000-scheduled.db
   ```

4. 重新启动。

恢复前会检查文件确实是科研小助理的数据库，并把当前数据库另存为一份"恢复前备份"，恢复错了还能换回来。

用 Docker 时：

```bash
docker compose stop
docker compose run --rm researchpilot node --import tsx /app/packages/core/src/scripts/backup.ts --list
docker compose run --rm researchpilot node --import tsx /app/packages/core/src/scripts/restore.ts researchpilot-20260928-090000-scheduled.db
docker compose up -d
```

## 换一台电脑

把 `data/researchpilot.db` 复制到新电脑仓库的 `data/` 目录下（或者复制一份备份，再用 `pnpm db:restore` 恢复），然后正常启动。复制前先停掉服务，或者直接复制最新的备份文件，它总是完整的。

## 暂不做的

- **桌面应用（Tauri）**：现在用浏览器打开 `localhost:8787` 已经够用，配合开机自启动体验接近桌面应用。Tauri 需要把 Node 服务打包成附带程序，并为每个平台签名，维护成本高，等真的需要时再做。
- **多设备同步（Litestream）**：Litestream 把 SQLite 持续复制到 S3 等对象存储，适合一台机器写、另一处只读或灾备，不能让两台电脑同时写同一个库。单人单机用上面的自动备份加同步盘已经够用。以后要在服务器上长期运行时再加。
