# ---------- build ----------
FROM node:24-alpine AS build
RUN npm install -g pnpm@11.17.0
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/config/package.json packages/config/
COPY packages/mcp/package.json packages/mcp/
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @openkeep/web build && pnpm --filter @openkeep/server build

# Production node_modules for the server only (workspace deps are bundled).
RUN pnpm --filter @openkeep/server deploy --prod --legacy /out/server

# ---------- runtime ----------
FROM node:24-alpine
ENV NODE_ENV=production
RUN addgroup -S openkeep && adduser -S openkeep -G openkeep
WORKDIR /app

COPY --from=build /out/server/node_modules ./node_modules
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/server/drizzle ./drizzle
COPY --from=build /repo/apps/web/dist ./web-dist

ENV WEB_DIST_DIR=/app/web-dist \
    STORAGE_DIR=/data \
    PORT=3000 \
    HOST=0.0.0.0
RUN mkdir -p /data && chown openkeep:openkeep /data
USER openkeep
EXPOSE 3000
VOLUME /data

# node fetch, not wget: busybox wget honors proxy env that Docker clients with
# a `proxies` config inject into containers, breaking loopback healthchecks.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/healthz').then((r)=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "dist/index.js"]
