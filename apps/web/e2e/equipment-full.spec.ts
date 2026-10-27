import { expect, test } from "@playwright/test";

import { demo1Id, grantWa, prisma, uniq } from "./helpers";

let opticName: string;
const mags: string[] = [];

test.beforeAll(async () => {
  const d1 = await demo1Id();
  opticName = `E2E Targeting Optic ${uniq()}`;
  await grantWa(d1, "OPTIC", 2, opticName);
  for (const suffix of ["Alpha", "Bravo", "Charlie"]) {
    mags.push((await grantWa(d1, "MAGAZINE", 1, `E2E Mag ${suffix} ${uniq()}`)).id);
  }
});

test.describe("equipment: equip, merge, split", () => {
  test("equipping a stored attachment fills its slot", async ({ page }) => {
    const d1 = await demo1Id();
    const optic = await prisma.equipmentItem.findFirst({ where: { name: opticName } });
    expect(optic).toBeTruthy();

    await page.goto("/equipment");
    const row = page.locator("div").filter({ hasText: opticName }).filter({ has: page.getByRole("button", { name: "equip", exact: true }) }).last();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole("button", { name: "equip", exact: true }).click();

    await expect(page.getByText("Equipped")).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => prisma.equippedSlot.count({ where: { itemId: optic!.id, citizenId: d1 } }))
      .toBe(1);
  });

  test("WA dealer merges 3×Q1 into one Q2 item", async ({ page }) => {
    const d1 = await demo1Id();
    const q2MagsBefore = await prisma.equipmentItem.count({ where: { ownerId: d1, slot: "MAGAZINE", quality: 2 } });

    await page.goto("/equipment");
    await page.getByRole("button", { name: "Merge & split" }).click();

    for (const id of mags) {
      const item = await prisma.equipmentItem.findUnique({ where: { id } });
      await page.locator("button").filter({ hasText: item!.name }).first().click();
    }

    const merge = page.getByRole("button", { name: /Merge selected \(3\/3\)/ });
    await expect(merge).toBeEnabled({ timeout: 10_000 });
    await merge.click();

    await expect(page.getByText(/Merged → Q\(x\+1\) item created/)).toBeVisible({ timeout: 15_000 });
    // the three ingredients are consumed and one fresh Q2 magazine appears
    await expect.poll(async () => prisma.equipmentItem.count({ where: { id: { in: mags } } })).toBe(0);
    const q2MagsAfter = await prisma.equipmentItem.count({ where: { ownerId: d1, slot: "MAGAZINE", quality: 2 } });
    expect(q2MagsAfter).toBe(q2MagsBefore + 1);
  });

  test("splitting breaks a Q2 item into two lower-Q items", async ({ page }) => {
    const d1 = await demo1Id();
    // newest Q2 magazine = the merge product from the previous test (seeded
    // Q2 mags may exist and would match otherwise)
    const merged = await prisma.equipmentItem.findFirst({
      where: { ownerId: d1, slot: "MAGAZINE", quality: 2 },
      orderBy: { createdAt: "desc" },
    });
    expect(merged).toBeTruthy();

    await page.goto("/equipment");
    const splitTarget = page
      .locator("div")
      .filter({ hasText: merged!.name })
      .filter({ has: page.getByRole("button", { name: /split/ }) })
      .last();
    await expect(splitTarget).toBeVisible({ timeout: 20_000 });
    await splitTarget.getByRole("button", { name: /split/ }).click();

    await expect(page.getByText(/Split into 2 lower-Q items/)).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => prisma.equipmentItem.count({ where: { id: merged!.id } })).toBe(0);
  });
});
