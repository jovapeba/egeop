/**
 * E2E global setup:
 *  1. Derives an isolated database URL (nationforge_e2e) from apps/api/.env
 *  2. Resets the schema + seeds a fresh v2 world into it
 *  3. Boots the compiled API on :3011 with an isolated Redis DB (/5) so the
 *     live stack on :3001/:3000 (and its BullMQ workers) are never touched
 *  4. Waits for readiness and persists { port, dbUrl, pid } for the tests
 *
 * Requires a prior API build (npm run build -w @egeopolis/api).
 */
const { spawn, execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const API_DIR = path.resolve(__dirname, "..", "..");
const STATE_FILE = path.join(__dirname, ".e2e-state.json");
const LOG_FILE = path.join(os.tmpdir(), "egeopolis-e2e-api.log");
const PORT = Number(process.env.E2E_API_PORT || 3011);
const DB_NAME = "nationforge_e2e";
const REDIS_DB = 5;

function readDotenv() {
  const raw = fs.readFileSync(path.join(API_DIR, ".env"), "utf8");
  const out = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#")) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function deriveDbUrl(url, dbName) {
  if (!/postgresql/.test(url)) throw new Error("only postgres URLs are supported");
  return url.replace(/(\/\/[^/]+)\/[^/?]+(\?.*)?$/, `$1/${dbName}$2`);
}

async function waitForApi(url, timeoutMs) {
  const started = Date.now();
  for (;;) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() - started > timeoutMs) throw new Error(`API did not become ready at ${url} within ${timeoutMs}ms — see ${LOG_FILE}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

module.exports = async function globalSetup() {
  const distEntry = path.join(API_DIR, "dist/apps/api/src/main.js");
  if (!fs.existsSync(distEntry)) {
    throw new Error(`API build not found at ${distEntry} — run: npm run build -w @egeopolis/api`);
  }

  const base = readDotenv();
  const dbUrl = deriveDbUrl(base.DATABASE_URL, DB_NAME);
  const redisUrl = `${(base.REDIS_URL || "redis://localhost:6379").replace(/\/\d+$/, "")}/${REDIS_DB}`;
  const env = {
    ...process.env,
    ...base,
    DATABASE_URL: dbUrl,
    REDIS_URL: redisUrl,
    PORT: String(PORT),
    WEB_ORIGIN: "http://localhost:3100,http://localhost:3000",
  };

  process.stdout.write(`[e2e] resetting schema on ${dbUrl.replace(/:[^:@/]+@/, ":***@")}…\n`);
  execSync("npx prisma db push --force-reset --skip-generate", { cwd: API_DIR, env, stdio: "inherit" });

  process.stdout.write("[e2e] seeding v2 world…\n");
  execSync("npx ts-node -r tsconfig-paths/register prisma/seed.ts", { cwd: API_DIR, env, stdio: "inherit" });

  // Bootstrap the staff account (the seed only creates demo citizens + founders).
  process.stdout.write("[e2e] bootstrapping staff account…\n");
  const { PrismaClient: PC } = require("@prisma/client");
  const bcrypt = require("bcryptjs");
  const pc = new PC({ datasourceUrl: dbUrl });
  const us = await pc.country.findUnique({ where: { code: "US" } });
  const cap = await pc.region.findFirst({ where: { countryId: us.id, isCapital: true } });
  await pc.citizen.upsert({
    where: { email: "staff@egeopolis.dev" },
    update: { isAdmin: true },
    create: {
      email: "staff@egeopolis.dev",
      passwordHash: await bcrypt.hash("staff1234", 10),
      nickname: "E2EStaff",
      level: 13,
      hp: 500,
      isAdmin: true,
      citizenshipCountryId: us.id,
      locationRegionId: cap.id,
    },
  });
  await pc.$disconnect();

  process.stdout.write(`[e2e] booting API on :${PORT}…\n`);
  fs.rmSync(STATE_FILE, { force: true });
  const log = fs.openSync(LOG_FILE, "a");
  const child = spawn("node", [distEntry], { cwd: API_DIR, env, stdio: ["ignore", log, log] });
  fs.writeFileSync(LOG_FILE, `[e2e] api boot ${new Date().toISOString()} pid=${child.pid}\n`, { flag: "a" });

  await waitForApi(`http://127.0.0.1:${PORT}/auth/countries`, 90_000);

  fs.writeFileSync(STATE_FILE, JSON.stringify({ port: PORT, dbUrl, pid: child.pid, logFile: LOG_FILE }));
  process.stdout.write(`[e2e] API ready (pid ${child.pid}) — state written\n`);
};
