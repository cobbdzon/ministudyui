# syntax=docker/dockerfile:1

# ---- build: install deps, compile SCSS, render brand assets ----------------
FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
# web/css/ and web/og-image.png are generated and gitignored. Building them here
# keeps sass and @resvg/resvg-js out of the runtime image.
RUN bunx sass web/scss:web/css --no-source-map \
 && bun run assets

# ---- runtime: production deps only, unprivileged ---------------------------
FROM oven/bun:1-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000 \
    BIND_HOST=0.0.0.0

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production \
 && rm -rf /root/.bun/install/cache

COPY --from=build /app/src ./src
COPY --from=build /app/shared ./shared
COPY --from=build /app/web ./web
COPY --from=build /app/scripts ./scripts

# The named volume inherits this ownership when it is first created.
RUN mkdir -p /data/users && chown -R bun:bun /data

USER bun
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/auth/status').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "src/http/server.ts"]
