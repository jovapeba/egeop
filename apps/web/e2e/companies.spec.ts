import { expect, test } from "@playwright/test";

import { demo1Id, prisma, uniq } from "./helpers";

test.describe("companies: create, manage, post job", () => {
  test("creating a manufactured company costs 20g and appears in Mine", async ({ page }) => {
    const name = `E2E Optics Plant ${uniq()}`;
    const d1 = await demo1Id();
    const goldBefore = Number((await prisma.citizen.findUniqueOrThrow({ where: { id: d1 } })).gold);

    await page.goto("/companies");
    await page.getByRole("button", { name: "Create (20g)" }).click();

    await page.getByPlaceholder("My Factory").fill(name);
    // first select = Product (AMMO is manufactured — no region resource needed);
    // second select = Region, left on the default "📍 my region"
    await page.locator("select").nth(0).selectOption({ value: "AMMO" });
    await page.getByRole("button", { name: "Create — 20g" }).click();

    await expect(page.getByText("Company created for 20g")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Mine", exact: true }).click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });

    // gold debited by exactly 20g (minor units ×100)
    await expect
      .poll(async () => Number((await prisma.citizen.findUniqueOrThrow({ where: { id: d1 } })).gold) - goldBefore)
      .toBe(-2000);
  });

  test("owner posts a job offer from the manage panel", async ({ page }) => {
    await page.goto("/companies");
    await page.getByRole("button", { name: "Mine", exact: true }).click();
    const manage = page.getByRole("button", { name: "manage" }).first();
    await expect(manage).toBeVisible({ timeout: 20_000 });
    await manage.click();

    // defaults: minEco 0, salary prefilled — post the job
    const post = page.getByRole("button", { name: "post job" });
    await expect(post).toBeVisible();
    await post.click();
    await expect(page.getByText("Job posted")).toBeVisible({ timeout: 15_000 });
  });
});
