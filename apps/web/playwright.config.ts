import { defineConfig } from "@playwright/test";

const API_PORT = 3011;
const WEB_PORT = 3100;

/**
 * Browser E2E against a fully isolated stack:
 *   API  :3011 (fresh nationforge_e2e DB, Redis /5)  — never the live :3001
 *   Web  :3100 (built with NEXT_PUBLIC_API_URL=:3011, dist .next-e2e) — never the live :3000
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1, // serial — specs share one seeded DB and daily-task state
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        storageState: "e2e/.state/demo1.json",
        viewport: { width: 1440, height: 900 },
      },
      dependencies: ["setup"],
    },
  ],
  webServer: [
    {
      command: "node e2e/start-e2e-api.cjs",
      url: `http://127.0.0.1:${API_PORT}/auth/countries`,
      timeout: 300_000,
      reuseExistingServer: false,
    },
    {
      command: "npm run build:e2e && npm run start:e2e",
      url: `http://localhost:${WEB_PORT}`,
      timeout: 420_000,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_API_URL: `http://localhost:${API_PORT}`,
        NEXT_DIST_DIR: ".next-e2e",
        PORT: String(WEB_PORT),
      },
    },
  ],
});
