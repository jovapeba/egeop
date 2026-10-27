import { expect, test } from "@playwright/test";

import { api, demo2Token, fundCompanyFiat, giveCompanyStorage, giveStorage, prisma, setHp, setLocation, uniq, usCapital, demo1Id } from "./helpers";

let companyName: string;

test.beforeAll(async () => {
  // demo2 owns the company demo1 applies to — in demo1's region (US capital),
  // manufacturing (AMMO needs no region resource), funded to pay wages.
  const cap = await usCapital();
  const d1 = await demo1Id();
  await setLocation(d1, cap!.id);
  companyName = `E2E Ammo Works ${uniq()}`;
  const tok = await demo2Token();
  const company = await api<{ id: string }>("/companies", {
    method: "POST",
    token: tok,
    body: { name: companyName, product: "AMMO", regionId: cap!.id },
  });
  await fundCompanyFiat(company.id, 1_000_000);
  // AMMO consumes GUNPOWDER from company storage — without it the shift
  // fails with "not enough raw materials in company storage".
  await giveCompanyStorage(company.id, "GUNPOWDER", 100);
  await api(`/companies/${company.id}/jobs`, {
    method: "POST",
    token: tok,
    body: { minEcoSkill: 0, salary: 1000 },
  });
});

test.describe("work page: daily actions & job market", () => {
  test("training raises strength", async ({ page }) => {
    await page.goto("/work");
    const train = page.getByRole("button", { name: /Train \(\+5 STR\)/ });
    await expect(train).toBeVisible({ timeout: 20_000 });
    await train.click();
    await expect(page.getByText(/Drills complete! Strength \+/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Trained ✓/ })).toBeVisible();
  });

  test("job market: find the company and apply", async ({ page }) => {
    await page.goto("/work");
    await page.getByPlaceholder("company…").fill(companyName);
    // innermost div carrying the company name + an Apply button = the job row
    const row = page.locator("div").filter({ hasText: companyName }).filter({ has: page.getByRole("button", { name: "Apply" }) }).last();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(new RegExp(`Applied at ${companyName}`))).toBeVisible({ timeout: 15_000 });
  });

  test("daily shift produces goods and pays the wage", async ({ page }) => {
    await page.goto("/work");
    const work = page.getByRole("button", { name: /Work Daily Shift/ });
    await expect(work).toBeVisible({ timeout: 20_000 });
    await work.click();
    await expect(page.getByText(/Shift finished! .* produced/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("button", { name: /Shift Finished/ })).toBeVisible();
  });

  test("eating rations restores HP", async ({ page }) => {
    const d1 = await demo1Id();
    await setHp(d1, 100);
    await giveStorage(d1, "FOOD", 1, 5);
    await page.goto("/work");
    const food = page.getByRole("button", { name: /🍞 Q1 ×5 \(\+10 HP\)/ });
    await expect(food).toBeVisible({ timeout: 20_000 });
    await food.click();
    await expect(page.getByText(/\+10 HP restored!/)).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await prisma.citizen.findUnique({ where: { id: d1 } }))!.hp).toBe(110);
  });
});
