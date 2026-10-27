import { expect, test as setup } from "@playwright/test";
import fs from "node:fs";

import { API, DEMO2, STAFF, login } from "./helpers";

const STATE_DIR = "e2e/.state";
const WEB_ORIGIN = "http://localhost:3100";

/**
 * Builds a Playwright storage state (localStorage `nf_token` on the web
 * origin) from a token obtained through the real /auth/login endpoint.
 */
function writeTokenState(token: string, file: string) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({
      cookies: [],
      origins: [{ origin: WEB_ORIGIN, localStorage: [{ name: "nf_token", value: token }] }],
    }),
  );
}

/**
 * Logs demo1 in through the real UI once and persists the session
 * (localStorage nf_token + cookie) for the chromium project.
 */
setup("authenticate as demo1", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("citizen@egeopolis.dev").fill("demo1@egeopolis.dev");
  await page.getByPlaceholder("••••••••").fill("demo1234");
  await page.getByRole("button", { name: "Sign in" }).last().click();

  await page.waitForURL("**/dashboard", { timeout: 20_000 });
  await expect(page).toHaveURL(/dashboard/);

  fs.mkdirSync(STATE_DIR, { recursive: true });
  await page.context().storageState({ path: `${STATE_DIR}/demo1.json` });
});

// demo2 & staff are only needed as *secondary* actors: their side of a
// cross-user flow runs over the API, and only staff also drives the UI.
setup("authenticate as demo2 (API)", async () => {
  writeTokenState(await login(DEMO2.email, DEMO2.password), `${STATE_DIR}/demo2.json`);
});

setup("authenticate as staff (API)", async () => {
  writeTokenState(await login(STAFF.email, STAFF.password), `${STATE_DIR}/staff.json`);
});
