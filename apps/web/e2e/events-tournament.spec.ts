import { expect, test } from "@playwright/test";

import { api, prisma, staffToken } from "./helpers";

const TYPE = "COUNTRY_CUP"; // no entry fee — any citizen of a country can register

test.beforeAll(async () => {
  // staff opens a fresh tournament so a REGISTERING row is guaranteed
  await api("/events", {
    method: "POST",
    token: await staffToken(),
    body: { type: TYPE, startsInMinutes: 60 },
  });
});

test.describe("events & tournaments", () => {
  test("the events hub lists tournaments and special events", async ({ page }) => {
    await page.goto("/events");
    await expect(page.getByText("Tournaments & Special Events")).toBeVisible({ timeout: 20_000 });
    // the freshly created COUNTRY_CUP row is open for registration
    await expect(page.getByRole("button", { name: /register/ }).first()).toBeVisible({ timeout: 10_000 });
  });

  test("citizen registers for an open tournament from the UI", async ({ page }) => {
    await page.goto("/events");

    const t = await prisma.tournament.findFirst({ where: { type: TYPE, status: "REGISTERING" }, orderBy: { createdAt: "desc" } });
    expect(t).toBeTruthy();

    const row = page.locator("div").filter({ has: page.getByRole("button", { name: /register/ }) }).last();
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole("button", { name: /register/ }).click();

    await expect(page.getByText(new RegExp(`Registered for `, "i"))).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => prisma.tournamentTeam.count({ where: { tournamentId: t!.id } })).toBeGreaterThanOrEqual(1);
  });
});
