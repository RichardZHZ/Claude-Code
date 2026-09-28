#!/bin/sh
# 以数据目录所有者的身份运行，这样宿主机上 data/ 里的数据库和备份仍归你自己所有。
# 数据目录是 Docker 刚创建的（属于 root）时，交给镜像里的 node 用户。
set -e
data_dir=$(dirname "$DB_PATH")
mkdir -p "$data_dir"
if [ "$(id -u)" = "0" ]; then
  if [ "$(stat -c %u "$data_dir")" = "0" ]; then
    chown node:node "$data_dir"
  fi
  uid=$(stat -c %u "$data_dir")
  gid=$(stat -c %g "$data_dir")
  exec setpriv --reuid="$uid" --regid="$gid" --clear-groups "$@"
fi
exec "$@"
