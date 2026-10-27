import { expect, test } from "@playwright/test";

import { api, demo2Token, prisma, uniq } from "./helpers";

const HEADLINE = `E2E War Dispatch ${uniq()}`;
const SHOUT = `E2E shout ${uniq()} — hello eGeopolis!`;

test.describe("media: newspaper, articles, shoutbox", () => {
  test("founding a newspaper costs 20g", async ({ page }) => {
    await page.goto("/media");
    await page.getByRole("button", { name: "Write Article" }).click();

    await expect(page.getByText("Press License Required")).toBeVisible({ timeout: 20_000 });
    await page.getByPlaceholder("e.g. The Aurelian Tribune, Frontline Chronicle…").fill("The E2E Tribune");
    await page.getByRole("button", { name: /Found Newspaper \(20g\)/ }).click();

    await expect(page.getByText("Newspaper successfully established!")).toBeVisible({ timeout: 15_000 });
  });

  test("publishing an article puts it into the feed", async ({ page }) => {
    await page.goto("/media");
    await page.getByRole("button", { name: "Write Article" }).click();

    await page.getByPlaceholder("Enter an eye-catching headline…").fill(HEADLINE);
    // the body is a contentEditable surface (data-placeholder), not an input —
    // getByPlaceholder can never match it
    await page.locator("[data-placeholder^='Write your story here']").fill("The southern front holds. Full analysis inside.");
    await page.getByRole("button", { name: /Publish Article/ }).click();

    await expect(page.getByText("Article published successfully!")).toBeVisible({ timeout: 15_000 });

    // article appears in the feed (and demo2 can find it over the API)
    await page.getByRole("button", { name: "Articles Feed" }).click();
    await expect(page.getByText(HEADLINE).first()).toBeVisible({ timeout: 15_000 });
  });

  test("readers upvote and subscribe via the API", async ({ page }) => {
    const articles = await api<Array<{ id: string; title: string; newspaper: { id: string }; upvotes: number }>>("/media/articles", {
      token: await demo2Token(),
    });
    const article = articles.find((a) => a.title === HEADLINE);
    expect(article).toBeTruthy();

    await api(`/media/articles/${article!.id}/upvote`, { method: "POST", token: await demo2Token() });
    await api(`/media/portals/${article!.newspaper.id}/subscribe`, { method: "POST", token: await demo2Token() });

    const row = await prisma.article.findUnique({ where: { id: article!.id } });
    expect(Number(row!.upvotes)).toBeGreaterThanOrEqual(1);
    const subs = await prisma.subscription.count({ where: { portalId: article!.newspaper.id } });
    expect(subs).toBeGreaterThanOrEqual(1);
  });

  test("shoutbox broadcasts a global message", async ({ page }) => {
    await page.goto("/media");
    await page.getByRole("button", { name: "Live Shouts" }).click();

    await page.getByPlaceholder(/Broadcast a brief transmission/).fill(SHOUT);
    await page.getByRole("button", { name: /Broadcast/ }).click();

    await expect(page.getByText("Shouted to the world!")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(SHOUT)).toBeVisible({ timeout: 10_000 });
  });
});
