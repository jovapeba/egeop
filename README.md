# eGeopolis ⚒️

**Open-source MMO social-strategy browser game inspired by [e-Sim](https://e-sim.org)** — economy, real-time warfare and politics in one persistent world. Work daily, train, fight in live battles, trade on global markets, get elected, and conquer the map.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) ![Stack](https://img.shields.io/badge/Next.js%2014%20·%20NestJS%2010%20·%20PostgreSQL%2016%20·%20Redis%207-0b0e14)

---

## Quick start (single command)

```bash
npm install
npm run start          # docker compose up --build → api :3001, web :3000
```

Native development instead:

```bash
npm run infra:up       # postgres (:5434) + redis (:6379)
npm run db:migrate     # prisma migrate dev
npm run db:seed        # world: 5 countries × 6 regions, taxes, parties, demo users
npm run dev:api        # NestJS on :3001
npm run dev:web        # Next.js on :3000
```

**Demo accounts** (after seeding): `demo1@egeopolis.dev` / `demo1234` (level 10 fighter), `demo2…3` (level 3). Founders (`founder1_1@egeopolis.dev` …) are presidents/congressmen — password `nationforge`.

> Host port note: compose maps postgres to **5434** (5432/5433 were occupied on the dev machine). `apps/api/.env` matches.

---

## Monorepo layout

```
nationforge/
├─ apps/
│  ├─ api/                # NestJS 10 — REST + Socket.IO + BullMQ workers
│  │  ├─ prisma/          # schema.prisma (all models) + migrations + seed
│  │  └─ src/
│  │     ├─ game/         # shared foundation: ledger, storage, medals, XP, equipment aggregation
│  │     ├─ auth/ citizens/ actions/      # citizen CRUD, daily loop (work/train/consume/travel)
│  │     ├─ equipment/    # 8 slots, Q1–Q7, merge/split/auctions, battle drops
│  │     ├─ companies/    # creation, upgrades, industry change, job market, storage
│  │     ├─ markets/      # product order-book (VAT/import) + monetary FX book
│  │     ├─ stocks/       # JSC: shares, limit orders, dividends
│  │     ├─ wars/         # war/battle/round lifecycle, fight engine, Socket.IO gateway
│  │     ├─ mu/           # military units: ranks, vault, orders, 1-click supply
│  │     ├─ politics/     # parties, 30-day elections (D'Hondt), laws executor
│  │     ├─ media/        # newspapers, articles, tips, shouts
│  │     └─ queues/       # BullMQ: HP regen, day-change, battle sweep, election tick
│  └─ web/                # Next.js 14 App Router — Tailwind, Lucide, Socket.IO client, SVG map
└─ packages/game-core/    # pure TS rulebook: wiki constants + formulas (shared API↔web)
```

## Systems implemented

| Module | Highlights |
|---|---|
| **Citizen** | HP 0–100 (+10/h regen, +50 day-change), strength, eco skill, XP/levels (wiki curve), military ranks Rookie→Deus |
| **Daily loop** | Work (−10 HP, wiki productivity `P=(4+E)·N·C·R·M`, net wage + tax), Train (`5.0 + Level·0.1 + TC`), streak medals |
| **Equipment** | 8 slots × Q1–Q7, 11 wiki parameters with per-quality ranges, merge 3→1 (0.3–81g fees), split → 2×Q−1, auctions (2%), battle drop tables |
| **Products** | 6 raws → 9 goods; raw need = base×Q (Food 1, Gift/Weapon 2, Ticket 4, House/Hosp/DS 300, Estate 600); regional density factors |
| **Companies** | 20g create; cumulative 20/40/90/190/390g; job market with eco gates & salaries; storage deposits; sale/relocate/industry change |
| **Markets** | Per-country product order-book with VAT + import tax → treasury; monetary FX limit book (fiat↔gold, escrowed) |
| **JSC** | 100g creation (50 fee/50 treasury), ≤1,000,000 shares, limit order-book, proportional gold dividends |
| **Warfare** | Direct/RW/civil wars; 2h rounds, first to 8 wins; live wall via Socket.IO; berserk ×5; crit/miss/avoid rolls; DS +5%·Q wall & damage; hospital regen; BH/CH medals; loot drops; region conquest; country elimination |
| **Politics** | 30-day cycle: president d5, party leader d15, congress d25 (D'Hondt party-list, 20 seats); laws with 48h votes: taxes, min wage, print money (0.005g/CC), treasury transfers, bonds, declare war/attack/peace, deploy buildings, MPP, impeachment (70%) |
| **Media** | Newspapers (2g), articles (1/h, sanitized HTML), subscriptions → Media Mogul, gold tips, live shouts (global/country/MU) |
| **Referrals** | 5g per referral reaching L7 (+2g to the friend), Society Builder medal per 10, 10% share of medal gold |

## Concurrency & reliability

- **Redis distributed locks** (`SET NX PX` + token + compare-del Lua) on: fights, merges, market buy/cancel, monetary trades, stock matching, dividends, daily resets.
- **PostgreSQL row locks** (`SELECT … FOR UPDATE`) + guarded `UPDATE … WHERE qty ≥ n` arithmetic inside transactions.
- **BullMQ** workers: `hp-regen` (1h), `day-change` (60s rollover detection), `battle-sweep` (rounds, civil polls, expired laws), `elections-tick` (30m) — all idempotent.
- **Socket.IO** gateway: Redis pub/sub fan-out to `battle:{id}` rooms — wall %, hit feed, round timers.

## API overview

`POST /auth/register|login` · `GET /auth/me` · `POST /actions/work|train|consume` · `GET /citizens/map` · `POST /citizens/me/travel` · `GET/POST /companies…` · `GET /companies/jobs` · `GET/POST /markets/product…` · `GET/POST /markets/monetary…` · `POST /stocks…` · `GET/POST /wars…` (`resistance`, `civil`, `battles/:id/fight`) · `GET/POST /politics/parties|elections|laws…` · `GET/POST /media/articles|shouts…` · `GET/POST /mu…` · full OpenAPI shape in each `*.controller.ts`.

## Spec-vs-wiki divergences (documented decisions)

| Topic | Spec said | Implemented (wiki source) |
|---|---|---|
| Ticket travel HP | Q1 −100 … Q5 −20 | **Q1 −40 … Q5 0** (wiki: Health/Ticket) |
| Company upgrades | 20/45/90/190 | **deltas 20/50/100/200** (cumulative 20/40/90/190/390, wiki: Productivity formula) |
| RW cost | 50g | **20g**, level 10, 15-min cooldown (wiki: Resistance war) |
| XP per work/train | 1 | **1** (spec kept) — wiki tables (5/4) noted in `game-core` |
| Eco gain | +0.02–0.05 | **spec kept** (wiki days-per-level variant available as `ecoGainPerWorkWiki`) |
| Hospital | daily free heal | **battle regen: 5%·Q chance to refund hit cost** (wiki: Hospital) |
| Houses/Estates | stack limits | **only best counts** (wiki: House/Estate) |

## Testing

Two E2E layers ship with the repo. **Both run against a fully isolated stack** — the `nationforge_e2e`
database (force-reset + reseeded per run), Redis DB `/5` for BullMQ, API on **:3011** and web on
**:3100** — so the live game on :3000/:3001 and its data are never touched.

### API E2E (Jest + ts-jest, black-box HTTP)

```bash
npm run build:api          # once — the suite boots the compiled server
npm run test:e2e           # root, or: npm run test:e2e -w @egeopolis/api
```

- 7 suites / 64 tests covering auth, citizens & travel, economy (companies/jobs/market),
  warfare (declare → 8-round conquest → region transfer, training yard rank cap), politics
  (laws, citizenship), community (ratings, friends, mail, media, chat) and misc (JSC exchange,
  auctions, MUs, loans, staff, stats, events).
- `apps/api/test/e2e/global-setup.cjs` resets + seeds `nationforge_e2e`, bootstraps the staff
  account and spawns the API; tests hit it with plain `fetch`. Direct-DB access is used only
  for fixtures and time-travel (never for actions under test).
- Demo accounts: `demo1/2/3@egeopolis.dev` / `demo1234`, staff `staff@egeopolis.dev` / `staff1234`.
- The e2e database is kept after runs for inspection; the next run force-resets it.

### Browser E2E (Playwright, real UI)

```bash
npm run build:api          # once — same compiled server
npm run test:e2e:web       # root, or: npm run test:e2e -w @egeopolis/web
```

- Spawns the same isolated API (:3011) and a production build of the web app on :3100
  (`NEXT_PUBLIC_API_URL=http://localhost:3011`, dist `.next-e2e` — the live server's `.next`
  is never clobbered).
- Logs demo1 in through the real login form once (`auth.setup.ts`), then all suites reuse the
  session via `storageState`; demo2/staff storage states are built programmatically so
  cross-user flows (bids, votes, repayments, staff audits) drive the UI as demo1 and act as
  the counterpart through the HTTP API on :3011.
- **19 specs / 61 tests cover every feature through the real UI** (serial run, shared seeded
  DB): landing/login, navigation smoke, world map & travel (all 5 ticket classes), work &
  training (apply, shift, food/energy boosts), companies (found, fund, job board), market
  (list, buy, cancel), monetary market (post escrowed gold→fiat, take an offer), politics
  (propose → vote → executed), military units (enlist, roster, donate, public unit profiles with member-only vault scoping), auctions (bid war,
  cancel, own listings), media (article, shout, newspaper), contracts (offer → accept →
  repay), combat (training-yard single + berserk bursts), equipment (equip, WA merge ×3→Q+1,
  split), staff deck (restricted wall, overview, citizen audit), dashboard widgets, events
  (tournament bracket), profile, and game pages.
- `apps/web/e2e/helpers.ts` shares a typed fetch API client plus Prisma fixtures (fund wallet,
  grant attachments, pass laws, seat congressmen…) — direct-DB access is used only for
  fixtures and assertions, never for actions under test.

## Deployment (Docker)

`docker-compose.yml` runs the full production stack: **Postgres 16 + Redis 7 + API + Web**.
Each app has its own multi-stage Dockerfile (`apps/api/Dockerfile`, `apps/web/Dockerfile`);
builds happen inside the image from the repo root (npm-workspaces monorepo).

```bash
docker compose up -d --build      # build images, boot the whole stack
docker compose logs -f api        # migrations + (first boot) world seed
docker compose ps                 # all services should be healthy
```

- On boot the API container runs `prisma migrate deploy`, then **seeds the world once** —
  only when the database is empty (`SEED_ON_BOOT=false` disables). Restarts skip the seed.
- Data persists in the `pgdata` volume; `docker compose down` keeps it, `down -v` deletes it.
- The web image **bakes `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` into the client bundle
  at build time** — when deploying behind a real domain, pass them before `--build`:

  ```bash
  NEXT_PUBLIC_API_URL=https://api.example.com \
  NEXT_PUBLIC_WS_URL=https://api.example.com \
  WEB_ORIGIN=https://app.example.com \
  JWT_SECRET="$(openssl rand -hex 32)" \
  docker compose up -d --build
  ```

- `WEB_ORIGIN` is the API's CORS allowlist (who may call it). Host ports are overridable via
  `WEB_PORT` / `API_PORT` / `POSTGRES_PORT` / `REDIS_PORT` (defaults 3000/3001/5434/6379).
  In-container ports stay fixed (3001/3000) — publish maps change only.
- Server-side calls are proxied same-origin: the browser may talk to `NEXT_PUBLIC_API_URL`
  directly, or to `/api/*` which the Next server rewrites to the API container
  (`API_INTERNAL_URL=http://api:3001`).
- Update an app: `git pull && docker compose up -d --build api` (or `web`) — postgres/redis
  stay up and data is untouched.

## Roadmap


Special items (steroids/tank/medkit shop), English-style bidding auctions, coalition/alliance diplomacy, treaty acceptance flows, MU companies, national monuments, speed-server profile (40-min rounds).

## License

MIT — see [LICENSE](LICENSE). Mechanics researched from the community mirror of the official wiki: [esim.fandom.com](https://esim.fandom.com/wiki/E-Sim_Wiki).
