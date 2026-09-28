# 科研小助理：一个容器同时提供网页和 API（端口 8787），数据放在 /data。
# 构建：docker compose up -d --build

# 构建阶段用完整镜像：自带 python3、make、g++，better-sqlite3 没有匹配的预编译包时可以现场编译。
# 运行阶段用同一 Debian 版本的精简镜像，编译出的原生模块可以直接用。
FROM node:22-bookworm AS toolchain
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/mcp/package.json apps/mcp/
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/

# 构建前端。
FROM toolchain AS web
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @researchpilot/web build

# 运行只需要 API 及其依赖（不含开发工具）。
FROM toolchain AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter @researchpilot/api...

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DB_PATH=/data/researchpilot.db \
    BACKUP_DIR=/data/backups \
    WEB_DIST=/app/apps/web/dist
COPY --from=prod-deps /app ./
COPY packages/core ./packages/core
COPY apps/api ./apps/api
COPY --from=web /app/apps/web/dist ./apps/web/dist
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/researchpilot-entrypoint
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
WORKDIR /app/apps/api
ENTRYPOINT ["researchpilot-entrypoint"]
CMD ["node", "--import", "tsx", "src/serve.ts"]
