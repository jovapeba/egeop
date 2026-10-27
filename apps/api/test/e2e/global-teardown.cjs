/**
 * E2E global teardown: stops the API spawned by global-setup and removes the
 * state file. The e2e database is intentionally kept for post-run inspection;
 * the next run force-resets it anyway.
 */
const fs = require("node:fs");
const path = require("node:path");

const STATE_FILE = path.join(__dirname, ".e2e-state.json");

module.exports = async function globalTeardown() {
  if (!fs.existsSync(STATE_FILE)) return;
  const { pid } = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  if (pid) {
    try {
      process.kill(pid, "SIGTERM");
      await new Promise((r) => setTimeout(r, 1500));
      process.kill(pid, 0); // still alive?
      process.kill(pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
  fs.rmSync(STATE_FILE, { force: true });
  process.stdout.write(`[e2e] API (pid ${pid}) stopped\n`);
};
