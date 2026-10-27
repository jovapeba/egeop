/**
 * Starts a fully isolated API for the Playwright run:
 *   nationforge_e2e DB (force-reset + seeded) · Redis /5 · port 3011.
 * Runs in the foreground so Playwright can manage its lifecycle; the live
 * stack on :3001 is never touched.
 */
const { spawn, execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const API_DIR = path.resolve(__dirname, "..", "..", "api");
const PORT = 3011;
const DB_NAME = "nationforge_e2e";
const REDIS_DB = 5;

function readDotenv() {
  const raw = fs.readFileSync(path.join(API_DIR, ".env"), "utf8");
  const out = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#")) out[m[1]] = m[2].replace(/^[\"']|[\"']$/g, "");
  }
  return out;
}

const base = readDotenv();
const dbUrl = base.DATABASE_URL.replace(/(\/\/[^/]+)\/[^/?]+(\?.*)?$/, `$1/${DB_NAME}$2`);
const redisUrl = `${(base.REDIS_URL || "redis://localhost:6379").replace(/\/\d+$/, "")}/${REDIS_DB}`;
const env = {
  ...process.env,
  ...base,
  DATABASE_URL: dbUrl,
  REDIS_URL: redisUrl,
  PORT: String(PORT),
  WEB_ORIGIN: "http://localhost:3100,http://localhost:3000",
};

const distEntry = path.join(API_DIR, "dist/apps/api/src/main.js");
if (!fs.existsSync(distEntry)) {
  console.error("API build missing — run: npm run build -w @egeopolis/api");
  process.exit(1);
}

function run(cmd) {
  execSync(cmd, { cwd: API_DIR, env, stdio: "inherit" });
}

run("npx prisma db push --force-reset --skip-generate");
run("npx ts-node -r tsconfig-paths/register prisma/seed.ts");

// staff account bootstrap (seed only creates demo users)
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
(async () => {
  const pc = new PrismaClient({ datasourceUrl: dbUrl });
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
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

const child = spawn("node", [distEntry], { cwd: API_DIR, env, stdio: "inherit" });
function shutdown() {
  child.kill("SIGTERM");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
child.on("exit", (code) => process.exit(code ?? 0));
