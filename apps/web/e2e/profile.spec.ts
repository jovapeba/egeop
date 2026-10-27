import { expect, test } from "@playwright/test";

test.describe("profile", () => {
  test("shows the citizen profile with native currency wallet", async ({ page }) => {
    await page.goto("/profile");
    await expect(page).toHaveURL(/profile/);
    // demo1 profile basics (nickname seeded as DemoCitizen1)
    await expect(page.locator("main").getByText(/DemoCitizen1|demo1/i).first()).toBeVisible({ timeout: 20_000 });
    // the player-card widget (sidebar) renders the native-currency balance (500 CC for demo1)
    await expect(page.locator("aside").getByText(/US-Coin|◈/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("aside").getByText("500").first()).toBeVisible();
  });

  test("profile shows level, military rank and social tabs", async ({ page }) => {
    await page.goto("/profile");
    // h1 badges: level + rank name, plus the damage-bonus line
    await expect(page.locator("main").getByText(/damage bonus/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("main").getByRole("button", { name: "Friends & Mail" })).toBeVisible();
    await expect(page.locator("main").getByRole("button", { name: "Packs" })).toBeVisible();
  });
});
