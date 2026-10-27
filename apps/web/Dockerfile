# syntax=docker/dockerfile:1
# eGeopolis web (Next.js 14, standalone output). Build context is the REPO ROOT
# (compose sets it) — the workspace deps hoist to the root.

# ---- deps: install the whole workspace ----
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/game-core/package.json packages/game-core/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci

# ---- build: game-core dist → next build (standalone) ----
FROM deps AS build
COPY packages/game-core packages/game-core
RUN npm run build:core
COPY apps/web apps/web
# NEXT_PUBLIC_* vars are baked into the client bundle at BUILD time — rebuild
# the image (or use build args) when the public API/WS URL changes.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_WS_URL=http://localhost:3001
# Rewrites (like NEXT_PUBLIC_*) are evaluated and BAKED at build time in the
# standalone server — API_INTERNAL_URL must be a build arg, not runtime env.
ARG API_INTERNAL_URL=http://api:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL \
    API_INTERNAL_URL=$API_INTERNAL_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build:web

# ---- runner: standalone server + static assets (no node_modules needed) ----
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
# API_INTERNAL_URL (server-side /api/* rewrites → the api container) is passed
# as a runtime env var by docker-compose.
# In a monorepo, the standalone output nests the server at apps/web/server.js
# and node_modules at the root — copy the whole standalone tree as-is.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
