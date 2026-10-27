import { expect, test } from "@playwright/test";

import { api, countryByCode, demo1Id, demo2Token, fundWallet, giveStorage, prisma } from "./helpers";

const foodCount = async () => {
  const d1 = await demo1Id();
  const row = await prisma.storage.findUnique({
    where: { ownerType_ownerId_product_quality: { ownerType: "CITIZEN", ownerId: d1, product: "FOOD" as never, quality: 1 } },
  });
  return Number(row?.quantity ?? 0);
};

const usWalletOf = async (citizenId: string) => {
  const us = await countryByCode("US");
  return Number(
    (await prisma.citizenWallet.findUniqueOrThrow({ where: { citizenId_countryId: { citizenId, countryId: us!.id } } })).amount,
  );
};

test.beforeAll(async () => {
  // demo2 lists FOOD Q1 @ 10g on the US market. demo1 is located in the US —
  // wallets are created lazily, so fund demo1's US wallet for the purchase.
  const us = await countryByCode("US");
  await fundWallet(await demo1Id(), us!.id, 100_000);
  await giveStorage(await demo1Id(), "FOOD", 1, 10);
  await api("/markets/product", {
    method: "POST",
    token: await demo2Token(),
    body: { product: "FOOD", quality: 1, unitPrice: 10, stock: 5 },
  });
});

test.describe("market: buy, list, cancel offers", () => {
  test("buying a listed offer debits the local wallet and credits storage", async ({ page }) => {
    const walletBefore = await usWalletOf(await demo1Id());

    await page.goto("/market");
    // the Buy TAB also matches /Buy/ — scope to the offer row instead
    // (demo2's FOOD Q1, stock 5 @ 10.00 CC → 10.10 CC with 1% VAT).
    // "food Q1" and "stock 5" are sibling divs, so textContent joins
    // without whitespace ("food Q1stock 5") — allow zero spaces.
    const row = page.locator("div").filter({ hasText: /food Q1\s*stock 5/ }).filter({ has: page.getByRole("button", { name: "Buy" }) }).last();
    const buy = row.getByRole("button", { name: "Buy" });
    await expect(buy).toBeVisible({ timeout: 20_000 });
    await buy.click();

    await expect(page.getByText(/Purchased 1× food for .* CC \(incl\. VAT\)!/)).toBeVisible({ timeout: 15_000 });
    await expect.poll(foodCount).toBe(11);

    expect(await usWalletOf(await demo1Id())).toBeLessThan(walletBefore); // price + VAT charged
  });

  test("listing an own offer escrows stock and shows it as active", async ({ page }) => {
    await page.goto("/market");
    await page.getByRole("button", { name: "Sell", exact: true }).click();

    // defaults: FOOD · Q1 · stock 1 · price 1.50 — just list it
    await page.getByRole("button", { name: "List offer" }).click();

    await expect(page.getByText(/Offer listed: 1× food @ 1\.50 CC/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/food ×1 @ 1\.50/)).toBeVisible({ timeout: 10_000 });
    await expect.poll(foodCount).toBe(10); // escrowed 11 → 10
  });

  test("cancelling an own offer returns the stock", async ({ page }) => {
    await page.goto("/market");
    await page.getByRole("button", { name: "Sell", exact: true }).click();

    await page.getByRole("button", { name: "cancel", exact: true }).first().click();
    await expect(page.getByText("Offer cancelled — stock returned.")).toBeVisible({ timeout: 15_000 });
    await expect.poll(foodCount).toBe(11);
  });
});
