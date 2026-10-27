import { expect, test } from "@playwright/test";

test.describe("equipment & fight access", () => {
  test("equipment page lists starter gear storage", async ({ page }) => {
    await page.goto("/equipment");
    await expect(page).toHaveURL(/equipment/);
    await expect(page.locator("main").getByText(/equipment|weapon|ammo/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("fight page shows battle fronts (seeded training yard)", async ({ page }) => {
    await page.goto("/fight");
    await expect(page).toHaveURL(/fight/);
    await expect(page.locator("main").getByText(/battle|front|round|war/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("auction house page loads", async ({ page }) => {
    await page.goto("/auctions");
    await expect(page).toHaveURL(/auctions/);
    await expect(page.locator("main").getByText(/auction/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("stats page renders country statistics", async ({ page }) => {
    await page.goto("/stats");
    await expect(page).toHaveURL(/stats/);
    await expect(page.locator("main").getByText(/statistic|country|citizen/i).first()).toBeVisible({ timeout: 20_000 });
  });
});
