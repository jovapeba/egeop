import { expect, test } from "@playwright/test";

test.describe("dashboard: daily orders & widgets", () => {
  test("citizen panel, daily orders and briefing render", async ({ page }) => {
    await page.goto("/dashboard");

    await expect(page.getByText("Daily orders")).toBeVisible({ timeout: 20_000 });
    // task buttons reflect their state (done from earlier specs or still open)
    await expect(page.getByRole("button", { name: /Train \(\+5 STR\)|Trained ✓/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Work \(−10 HP\)|Worked ✓/ })).toBeVisible();

    // consumable budget bars
    await expect(page.getByText(/🍛 food/)).toBeVisible();
    await expect(page.getByText(/🎁 gifts/)).toBeVisible();

    // society panel + operations briefing
    await expect(page.getByText("Country & society")).toBeVisible();
    await expect(page.getByText("Operations briefing")).toBeVisible();
  });

  test("referral code copy shows a toast", async ({ page }) => {
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:3100" });
    await page.goto("/dashboard");

    // icon-only button (lucide `copy` svg) inside the Country & society panel
    await page.locator("button:has(svg.lucide-copy)").first().click();
    await expect(page.getByText("Referral code copied!")).toBeVisible({ timeout: 15_000 });
  });
});
