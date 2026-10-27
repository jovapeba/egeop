# syntax=docker/dockerfile:1
# eGeopolis API (NestJS + Prisma). Build context is the REPO ROOT (compose sets
# it) because this is an npm-workspaces monorepo — deps hoist to the root.

# ---- deps: install the whole workspace (devDeps kept: prisma CLI, ts-node) ----
FROM node:20-alpine AS deps
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/game-core/package.json packages/game-core/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci

# ---- build: game-core dist → prisma client → api dist → compiled seed ----
FROM deps AS build
COPY packages/game-core packages/game-core
RUN npm run build:core
COPY apps/api apps/api
# build:api = prisma generate && tsc -p tsconfig.build.json (→ dist/apps/api/src/main.js)
RUN npm run build:api
# compile the world seed to plain JS so the runtime image needs no ts-node
RUN cd apps/api && npx tsc --module commonjs --target ES2022 --moduleResolution node \
      --esModuleInterop --skipLibCheck --rootDir prisma --outDir dist-seed prisma/seed.ts

# ---- runner: workspace node_modules WITH the generated prisma client ----
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NODE_ENV=production
# copy from `build`, not `deps`: prisma generate writes the client into
# node_modules/.prisma — the deps stage doesn't have it yet
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/game-core/dist packages/game-core/dist
COPY packages/game-core/package.json packages/game-core/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/dist-seed ./seed-dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY apps/api/package.json apps/api/package.json
COPY docker/api-entrypoint.sh ./api-entrypoint.sh
RUN chmod +x api-entrypoint.sh

WORKDIR /app/apps/api
EXPOSE 3001
ENTRYPOINT ["/app/api-entrypoint.sh"]
