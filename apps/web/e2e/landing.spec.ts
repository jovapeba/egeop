import { expect, test } from "@playwright/test";

test.describe("landing page (guest)", () => {
  // force a guest session — the chromium project otherwise injects demo1's auth
  test.use({ storageState: { cookies: [], origins: [] } });

  test("shows the eGeopolis brand and feature grid", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("eGeopolis", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Build a nation. Break a nation." })).toBeVisible();
    await expect(page.getByText("Real-time warfare")).toBeVisible();
    await expect(page.getByRole("link", { name: "Enter the world" })).toBeVisible();
  });

  test("login page offers sign-in and registration tabs", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Sign in" }).first()).toBeVisible();
    // registration tab exists with country search
    await page.getByRole("button", { name: "New citizen" }).first().click();
    await expect(page.getByPlaceholder("citizen@egeopolis.dev")).toBeVisible();
    await expect(page.getByPlaceholder(/Search 220\+ real countries/)).toBeVisible();
  });

  test("rejects bad credentials with an error", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("citizen@egeopolis.dev").fill("demo1@egeopolis.dev");
    await page.getByPlaceholder("••••••••").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).last().click();
    await expect(page.getByText(/invalid|wrong|credentials/i)).toBeVisible({ timeout: 10_000 });
    await expect(page).not.toHaveURL(/dashboard/);
  });
});
