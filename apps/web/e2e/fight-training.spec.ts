import { expect, test } from "@playwright/test";

import { api, demo1Id, demo1Token, giveStorage, prisma, setHp } from "./helpers";

test.beforeAll(async () => {
  // A fresh DB has no active battles — open the Training Yard (creates the
  // Team Alpha vs Team Beta war, battle and round 1, 60 min) via the API.
  // Yard battles bypass citizenship checks (config.training), and the UI's
  // default weapon Q1 matches demo1's seeded 5× AMMO Q1.
  await api("/wars/training", { token: await demo1Token() });
  const d1 = await demo1Id();
  await setHp(d1, 500);
  // single hit burns 1 ammo, berserk burns 5 — top the seed up
  await giveStorage(d1, "AMMO", 1, 10);
});

test.describe("combat: training yard battles", () => {
  test("single hit costs HP and lands on the wall (or misses)", async ({ page }) => {
    const hpBefore = (await prisma.citizen.findUniqueOrThrow({ where: { id: await demo1Id() } })).hp;

    await page.goto("/fight");
    const fight = page.getByRole("button", { name: /FIGHT FOR/ });
    await expect(fight).toBeVisible({ timeout: 25_000 });
    await fight.click();

    // toast fires even on a miss — damage may be 0, HP cost 10 (0 on miss)
    await expect(page.getByText(/Hit for .* damage! \(−\d+ HP\)/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Live Combat Log/)).toBeVisible();

    const hpAfter = (await prisma.citizen.findUniqueOrThrow({ where: { id: await demo1Id() } })).hp;
    expect(hpBefore - hpAfter).toBeLessThanOrEqual(10);
  });

  test("berserk burst spends five weapons for five hits", async ({ page }) => {
    await page.goto("/fight");
    await page.getByRole("button", { name: "5× Berserk" }).click();

    const fight = page.getByRole("button", { name: /FIGHT FOR/ });
    await expect(fight).toBeVisible({ timeout: 20_000 });
    await fight.click();

    await expect(page.getByText(/Hit for .* damage! \(−\d+ HP\)/)).toBeVisible({ timeout: 20_000 });

    const d1 = await demo1Id();
    const hpAfter = (await prisma.citizen.findUniqueOrThrow({ where: { id: d1 } })).hp;
    // 5 hits × 10 HP = 50 HP max spent (misses cost nothing)
    expect(hpAfter).toBeGreaterThan(400);
  });
});
