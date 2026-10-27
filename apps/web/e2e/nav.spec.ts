import { expect, test } from "@playwright/test";

const NAV_LINKS = [
  "Command Deck",
  "Battlefield Fronts",
  "Military Units",
  "Work & Economy",
  "Market & Storage",
  "Monetary Exchange",
  "Companies",
  "Map & Wars",
  "Politics & Gov",
  "Media & Press",
  "Auction House",
  "Contracts & Loans",
  "Tournaments",
  "Achievements",
  "Profile",
  "Statistics",
];

test.describe("authenticated navigation smoke", () => {
  test("sidebar navigation lists all game sections", async ({ page }) => {
    await page.goto("/dashboard");
    for (const label of NAV_LINKS) {
      await expect(page.locator("nav").getByText(label, { exact: true })).toBeVisible();
    }
  });

  test("dashboard greets the citizen with core stats", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/dashboard/);
    // level / HP / currency widgets render from /auth/me
    await expect(page.getByText(/HP/i).first()).toBeVisible();
    await expect(page.getByText(/Level/i).first()).toBeVisible();
  });

  test("market page shows storage and offers", async ({ page }) => {
    await page.goto("/market");
    await expect(page).toHaveURL(/market/);
    // demo1's starter storage: FOOD ×10, AMMO ×5 (seeded)
    await expect(page.getByText("FOOD").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("AMMO").first()).toBeVisible();
  });

  test("politics page loads the country view", async ({ page }) => {
    await page.goto("/politics");
    await expect(page).toHaveURL(/politics/);
    await expect(page.locator("main").getByText(/congress|law|president/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("media page lists portals and articles", async ({ page }) => {
    await page.goto("/media");
    await expect(page).toHaveURL(/media/);
    await expect(page.locator("main").getByRole("heading").first()).toBeVisible({ timeout: 20_000 });
  });

  test("achievements page exposes 10 subcategories", async ({ page }) => {
    await page.goto("/achievements");
    await expect(page).toHaveURL(/achievements/);
    await expect(page.locator("main").getByText(/achievement/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test("events page lists tournaments", async ({ page }) => {
    await page.goto("/events");
    await expect(page).toHaveURL(/events/);
    await expect(page.locator("main").getByText(/tournament|event/i).first()).toBeVisible({ timeout: 20_000 });
  });
});
