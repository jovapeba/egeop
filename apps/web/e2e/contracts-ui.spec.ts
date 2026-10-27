import { expect, test } from "@playwright/test";

import { api, demo2Token } from "./helpers";

test.describe("contracts: loans end-to-end", () => {
  test("owner lists a loan — gold escrowed, offer visible", async ({ page }) => {
    await page.goto("/contracts");
    await page.getByRole("button", { name: "Create contract" }).click();

    // form defaults: 10g · 7 days · 10% interest
    await page.getByRole("button", { name: /list loan/ }).click();

    await expect(page.getByText(/Loan listed — 10g escrowed for 7 days at 10% interest\./)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Open contracts" }).click();
    await expect(page.getByText(/10\.00g loan · 7d · 10%/)).toBeVisible({ timeout: 15_000 });
  });

  test("borrower accepts via the API — escrowed gold transfers", async ({ page }) => {
    const tok2 = await demo2Token();
    const open = await api<Array<{ id: string; type: string; status: string }>>("/contracts", { token: tok2 });
    const loan = open.find((c) => c.type === "LOAN");
    expect(loan).toBeTruthy();

    await api(`/contracts/${loan!.id}/accept`, { method: "POST", token: tok2 });

    // accepted loans leave the OPEN list (demo1's UI shows it gone)
    await page.goto("/contracts");
    await expect(page.getByText(/10\.00g loan · 7d · 10%/)).toHaveCount(0, { timeout: 20_000 });

    const audit = await api<Array<{ id: string; type: string; status: string }>>("/contracts?status=ACCEPTED", { token: tok2 });
    expect(audit.some((c) => c.id === loan!.id)).toBe(true);
  });

  test("borrower repays — loan completes", async () => {
    const tok2 = await demo2Token();
    const accepted = await api<Array<{ id: string }>>("/contracts?status=ACCEPTED", { token: tok2 });
    const loan = accepted[0];
    expect(loan).toBeTruthy();

    // demo2 accepted, so demo2 is the borrower and settles the debt
    const res = await api<{ ok: boolean }>(`/contracts/${loan.id}/repay`, { method: "POST", token: tok2 });
    expect(res.ok).not.toBe(false);

    const completed = await api<Array<{ id: string }>>("/contracts?status=COMPLETED", { token: tok2 });
    expect(completed.some((c) => c.id === loan.id)).toBe(true);
  });
});
