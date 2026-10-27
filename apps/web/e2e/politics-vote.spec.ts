import { expect, test } from "@playwright/test";

import { api, countryByCode, demo1Id, fundTreasury, makeCongressman, passLaw, prisma, staffToken } from "./helpers";

test.beforeAll(async () => {
  const us = await countryByCode("US");
  await makeCongressman(await demo1Id(), us!.id);
});

/** The innermost div carrying both markers is the law row itself. */
const lawRow = (page: import("@playwright/test").Page, type: string, status: string) =>
  page.locator("div").filter({ hasText: type }).filter({ hasText: status }).last();

test.describe("politics: propose, vote, execute laws", () => {
  test("congressman proposes a law via the quick buttons", async ({ page }) => {
    await page.goto("/politics");
    await page.getByRole("button", { name: "Laws & Proposals" }).click();

    await page.getByRole("button", { name: /Print 50g→CC/ }).click();
    await expect(page.getByText("Law proposed!")).toBeVisible({ timeout: 15_000 });

    await expect(lawRow(page, "PRINT_MONEY", "VOTING")).toBeVisible({ timeout: 15_000 });
  });

  test("congressman votes YES on the proposal", async ({ page }) => {
    await page.goto("/politics");
    await page.getByRole("button", { name: "Laws & Proposals" }).click();

    const row = lawRow(page, "PRINT_MONEY", "VOTING");
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole("button", { name: "yes" }).click();

    await expect(page.getByText("Voted YES!")).toBeVisible({ timeout: 15_000 });
  });

  test("passed majority executes the law (PRINT_MONEY)", async ({ page }) => {
    // fast-track: fake super-majority + expire vote window + staff sweep.
    // PRINT_MONEY burns treasury gold to mint fiat — the seeded US treasury
    // cannot cover 50g, so fund it first or execution marks the law FAILED.
    const us = await countryByCode("US");
    await fundTreasury(us!.id, 100_000); // 1000g
    const laws = await api<Array<{ id: string; type: string; status: string }>>(
      `/politics/laws?countryId=${us!.id}`,
      { token: await staffToken() },
    );
    const law = laws.find((l) => l.type === "PRINT_MONEY" && l.status === "VOTING");
    expect(law).toBeTruthy();
    await passLaw(law!.id);

    expect((await prisma.law.findUnique({ where: { id: law!.id } }))!.status).toBe("EXECUTED");

    // the UI list shows the executed badge after reload
    await page.goto("/politics");
    await page.getByRole("button", { name: "Laws & Proposals" }).click();
    await expect(lawRow(page, "PRINT_MONEY", "EXECUTED")).toBeVisible({ timeout: 20_000 });
  });
});
