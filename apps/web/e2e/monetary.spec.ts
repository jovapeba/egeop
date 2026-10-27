import { expect, test } from "@playwright/test";

import { api, countryByCode, demo1Id, demo2Token, fundWallet, meId, prisma } from "./helpers";

test.beforeAll(async () => {
  // demo2 sells 100 US fiat at 0.005 g/CC (buys gold) — demo1 will take it in
  // the UI. Wallets are created lazily, so fund demo2's US wallet first
  // (selling FIAT debits it via a wallet row).
  const us = await countryByCode("US");
  await fundWallet(await meId(await demo2Token()), us!.id, 50_000);
  await api("/markets/monetary", {
    method: "POST",
    token: await demo2Token(),
    body: { sellAsset: "FIAT", sellCountryId: us!.id, sellAmount: 100, rate: 0.005, buyAsset: "GOLD" },
  });
});

test.describe("monetary market: fiat ↔ gold exchange", () => {
  test("posting a gold→fiat offer escrows the gold", async ({ page }) => {
    const d1 = await demo1Id();
    const goldBefore = Number((await prisma.citizen.findUniqueOrThrow({ where: { id: d1 } })).gold);

    await page.goto("/monetary");
    // defaults: sell GOLD 1 @ rate 200 → buy FIAT. Native <select>s in DOM
    // order: sellAsset(0), buyAsset(1), buyCountry(2 — rendered because
    // buyAsset defaults to FIAT), then the two filter selects. Pick US.
    await page.locator("select").nth(2).selectOption({ label: "US" });
    await page.getByRole("button", { name: "Post offer" }).click();

    await expect(page.getByText("Offer posted — amount escrowed.")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/gold → US · rate 200\.000 · left 1\.00/)).toBeVisible({ timeout: 10_000 });

    const goldAfter = Number((await prisma.citizen.findUniqueOrThrow({ where: { id: d1 } })).gold);
    expect(goldBefore - goldAfter).toBe(100); // 1g escrowed
  });

  test("taking another citizen's offer executes the exchange", async ({ page }) => {
    const d2 = await api<{ id: string }>("/auth/me", { token: await demo2Token() });
    const offer = await prisma.monetaryOffer.findFirst({ where: { ownerId: d2.id, active: true } });
    expect(offer).toBeTruthy();

    await page.goto("/monetary");
    // demo2's offer is the only US→gold row at rate 0.005 (seeds use 0.001)
    const row = page
      .locator("div")
      .filter({ hasText: /US → gold · rate 0\.00500000 · left 100\.00/ })
      .filter({ has: page.getByRole("button", { name: "Trade" }) })
      .last();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole("button", { name: "Trade" }).click();

    await expect(page.getByText("Trade executed.")).toBeVisible({ timeout: 15_000 });

    // remaining decreased by the 1-unit take
    await expect
      .poll(async () => Number((await prisma.monetaryOffer.findUnique({ where: { id: offer!.id } }))!.remaining))
      .toBeLessThan(Number(offer!.remaining));
  });
});
