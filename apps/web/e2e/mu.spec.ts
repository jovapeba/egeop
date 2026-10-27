import { expect, test } from "@playwright/test";

import { api, demo2Token, demo1Nickname, demo2Nickname, prisma, uniq, DEMO1, DEMO2 } from "./helpers";

const MU_NAME = `101st E2E Airborne ${uniq()}`;

test.beforeAll(async () => {
  // demo2 founds the unit (50g, level 13 ✓). Created units have recruitment
  // closed by default — open it and add a second slot so demo1 can enlist
  // directly ("Enlist in Unit" instead of "Apply for Enlistment").
  //
  // Idempotent across retried workers: the create endpoint rejects citizens
  // who already belong to an army, and MU_NAME is regenerated per run, so a
  // name-based lookup can never find the unit a previous worker created.
  // Look it up by demo2's leadership instead and rename it to this run's
  // MU_NAME so the search-driven enlist test still finds it.
  const tok = await demo2Token();
  const demo2 = await prisma.citizen.findFirst({ where: { email: DEMO2.email }, select: { id: true } });
  const commanded = await prisma.militaryUnit.findFirst({ where: { leaderId: demo2!.id } });
  if (!commanded) {
    await api("/mu", { method: "POST", token: tok, body: { name: MU_NAME } });
  }
  const mu = await prisma.militaryUnit.findFirst({ where: { leaderId: demo2!.id } });
  await prisma.militaryUnit.update({
    where: { id: mu!.id },
    data: { name: MU_NAME, memberSlots: 2, recruitmentOpen: true },
  });
  // Reset demo1 so the enlist test can replay cleanly on retried workers.
  const demo1 = await prisma.citizen.findFirst({ where: { email: DEMO1.email }, select: { id: true } });
  await prisma.muMembership.deleteMany({ where: { citizenId: demo1!.id } });
  await prisma.muApplication.deleteMany({ where: { citizenId: demo1!.id } });
});

test.describe("military units: enlist & donate", () => {
  test("citizen inspects another unit's public details from the directory", async ({ page }) => {
    await page.goto("/mu");
    await page.getByRole("button", { name: /Browse Units/ }).last().click();

    await page.getByPlaceholder(/Search Military Units/).fill(MU_NAME);
    const card = page.locator("div").filter({ hasText: MU_NAME }).filter({ has: page.getByRole("button", { name: "Details" }) }).last();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.getByRole("button", { name: "Details" }).click();

    // public profile: name, commander, recruitment status, public roster
    await expect(page.getByRole("heading", { name: new RegExp(`^${MU_NAME}`) })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("recruitment open")).toBeVisible();
    await expect(page.getByText(/Unit Roster \(1 Members\)/)).toBeVisible();
    await expect(page.getByText(await demo2Nickname()).first()).toBeVisible();
    // member-only data is never rendered for a non-member viewer
    await expect(page.getByText(/Unit vault and battle orders are visible to members only/)).toBeVisible();
    await expect(page.getByText("Unit Armory")).toBeHidden();

    await page.getByRole("button", { name: /Back to Units/ }).click();
    await expect(page.getByPlaceholder(/Search Military Units/)).toBeVisible();
  });

  test("citizen enlists in a unit via the browse directory", async ({ page }) => {
    await page.goto("/mu");
    // two "Browse Units" buttons exist (nav tab + empty-state CTA) — use the last
    await page.getByRole("button", { name: /Browse Units/ }).last().click();

    await page.getByPlaceholder(/Search Military Units/).fill(MU_NAME);
    const card = page.locator("div").filter({ hasText: MU_NAME }).filter({ hasText: /Enlist in Unit/ }).last();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.getByRole("button", { name: /Enlist in Unit/ }).click();

    await expect(page.getByText("Welcome to the Military Unit! Enlisted as Recruit.")).toBeVisible({ timeout: 15_000 });
  });

  test("roster shows the new recruit alongside the commander", async ({ page }) => {
    await page.goto("/mu");
    await expect(page.getByText(/Unit Roster \(2 Members\)/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(await demo2Nickname()).first()).toBeVisible();
    await expect(page.getByText(await demo1Nickname()).first()).toBeVisible();
  });

  test("member donates gold to the unit treasury", async ({ page }) => {
    await page.goto("/mu");
    const depositBtn = page.getByRole("button", { name: "Deposit Supplies" });
    await expect(depositBtn).toBeVisible({ timeout: 20_000 });
    await depositBtn.click();

    // modal: switch to the gold kind, keep default amount 5, confirm
    await page.getByRole("button", { name: "Gold Treasury" }).click();
    await page.getByRole("button", { name: "Deposit to Vault" }).click();

    await expect(page.getByText("Deposited 5 Gold into unit treasury!")).toBeVisible({ timeout: 15_000 });
  });
});
