import { expect, test } from "@playwright/test";

import { demo1Id, demo1Nickname } from "./helpers";

test.describe("staff deck: citizens are locked out", () => {
  test.use({ storageState: "e2e/.state/demo1.json" });

  test("regular citizens hit the Restricted Deck wall", async ({ page }) => {
    await page.goto("/staff");
    await expect(page.getByText("Restricted Deck")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/available to eGeopolis staff only/)).toBeVisible();
  });
});

test.describe("staff command deck (admin)", () => {
  test.use({ storageState: "e2e/.state/staff.json" });

  test("staff sees the overview with live totals", async ({ page }) => {
    await page.goto("/staff");
    await expect(page.getByText(/citizens/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/countries/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Shared-IP audit/)).toBeVisible();
  });

  test("staff can audit a citizen by id", async ({ page }) => {
    await page.goto("/staff");
    await page.getByPlaceholder("citizen id audit…").fill(await demo1Id());
    await page.getByRole("button", { name: "audit" }).click();

    // audit header renders "{nickname} — last IP …" (seeded nickname, not email localpart)
    await expect(page.getByText(new RegExp(`${await demo1Nickname()} — last IP`))).toBeVisible({ timeout: 15_000 });
  });
});
