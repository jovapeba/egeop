import { expect, test } from "@playwright/test";

import { api, demo1Id, demo2Token, grantWa, prisma, uniq } from "./helpers";

let itemName: string;
let itemId: string;

test.beforeAll(async () => {
  itemName = `E2E Match Barrel ${uniq()}`;
  itemId = (await grantWa(await demo1Id(), "BARREL", 2, itemName)).id;
});

test.describe("auction house: list, bid, cancel guard", () => {
  test("owner lists an attachment (1% listing fee)", async ({ page }) => {
    await page.goto("/auctions");
    await page.getByRole("button", { name: "List an item" }).click();

    await page.locator("select").first().selectOption({ label: `${itemName} (BARREL)` });
    await page.getByPlaceholder("start price g").fill("10");
    await page.getByRole("button", { name: /list auction/ }).click();

    await expect(page.getByText("Auction listed — 1% listing fee charged.")).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => prisma.auction.count({ where: { itemId } })).toBe(1);
  });

  test("another citizen outbids via the API and the top bid shows in the UI", async ({ page }) => {
    const auction = await prisma.auction.findFirst({ where: { itemId } });
    expect(auction).toBeTruthy();

    await api(`/auctions/${auction!.id}/bid`, { method: "POST", token: await demo2Token(), body: { amountGold: 12 } });

    await page.goto("/auctions");
    await page.getByRole("button", { name: "My activity" }).click();
    await expect(page.getByText(/→ top 12\.00g/)).toBeVisible({ timeout: 20_000 });
    // once a bid exists the seller can no longer cancel
    await expect(page.getByRole("button", { name: /cancel/ })).toHaveCount(0);
  });
});
