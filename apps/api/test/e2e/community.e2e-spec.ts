import {
  api,
  giveStorage,
  prisma,
  register,
  setGold,
  setLevel,
} from "./helpers";

describe("community: ratings (E2E)", () => {
  it("gates voting to level 13+ (403 for rookies)", async () => {
    const rookie = await register("rookierater");
    const target = await register("ratednewbie");
    await expect(
      api("/ratings", { method: "POST", token: rookie.token, body: { targetType: "CITIZEN", targetId: target.id, isLike: true } }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("records one vote per voter/target and supports changing it (upsert)", async () => {
    const voter = await register("voter");
    const target = await register("rated");
    await setLevel(voter.id, 13);
    await setLevel(target.id, 13);

    await api("/ratings", { method: "POST", token: voter.token, body: { targetType: "CITIZEN", targetId: target.id, isLike: true } });
    let agg = await api<{ likes: number; dislikes: number; myVote: boolean | null }>(`/ratings/CITIZEN/${target.id}`, { token: voter.token });
    expect(agg.likes).toBe(1);
    expect(agg.dislikes).toBe(0);
    expect(agg.myVote).toBe(true);

    // change vote → still one row
    await api("/ratings", { method: "POST", token: voter.token, body: { targetType: "CITIZEN", targetId: target.id, isLike: false } });
    agg = await api(`/ratings/CITIZEN/${target.id}`, { token: voter.token });
    expect(agg.likes).toBe(0);
    expect(agg.dislikes).toBe(1);
    expect(agg.myVote).toBe(false);
  });

  it("blocks self-voting on CITIZEN targets (400)", async () => {
    const c = await register("narcissist");
    await setLevel(c.id, 13);
    await expect(
      api("/ratings", { method: "POST", token: c.token, body: { targetType: "CITIZEN", targetId: c.id, isLike: true } }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rates STOCK_COMPANY and NEWS_PORTAL targets", async () => {
    const ceo = await register("mediaceo");
    await setGold(ceo.id, 1000);
    await setLevel(ceo.id, 13);

    const jsc = await api<{ id: string }>("/stocks", { method: "POST", token: ceo.token, body: { name: `Rated JSC ${ceo.id.slice(-4)}`, sharesTotal: 1000 } });
    const portal = await api<{ id: string }>("/media/portal", { method: "POST", token: ceo.token, body: { name: `Rated Portal ${ceo.id.slice(-4)}` } });

    const fan = await register("fan");
    await setLevel(fan.id, 13);

    await api("/ratings", { method: "POST", token: fan.token, body: { targetType: "STOCK_COMPANY", targetId: jsc.id, isLike: true } });
    await api("/ratings", { method: "POST", token: fan.token, body: { targetType: "NEWS_PORTAL", targetId: portal.id, isLike: true } });

    expect((await api<{ likes: number }>(`/ratings/STOCK_COMPANY/${jsc.id}`, { token: fan.token })).likes).toBe(1);
    expect((await api<{ likes: number }>(`/ratings/NEWS_PORTAL/${portal.id}`, { token: fan.token })).likes).toBe(1);
  });
});

describe("community: friends & private mail (E2E)", () => {
  it("friend request → accept → list → remove", async () => {
    const a = await register("frienda");
    const b = await register("friendb");

    await api("/friends", { method: "POST", token: a.token, body: { nickname: b.nickname } });
    await expect(api("/friends", { method: "POST", token: a.token, body: { nickname: b.nickname } })).rejects.toMatchObject({ status: 400 });

    const listB = await api<{ incoming: Array<{ id: string }>; friends: unknown[] }>("/friends", { token: b.token });
    expect(listB.incoming).toHaveLength(1);

    await api(`/friends/${listB.incoming[0].id}/accept`, { method: "POST", token: b.token });

    const listA = await api<{ friends: Array<{ citizen: { id: string } }> }>("/friends", { token: a.token });
    expect(listA.friends.map((f) => f.citizen.id)).toContain(b.id);

    await api(`/friends/${listB.incoming[0].id}`, { method: "DELETE", token: b.token });
    const after = await api<{ friends: unknown[] }>("/friends", { token: a.token });
    expect(after.friends).toHaveLength(0);
  });

  it("private messages are friends-only (403) and mark read receipts", async () => {
    const a = await register("mailer");
    const b = await register("mailee");
    const stranger = await register("stranger");

    await expect(api(`/friends/pm/${b.nickname}`, { method: "POST", token: stranger.token, body: { body: "spam" } })).rejects.toMatchObject({ status: 403 });

    await api("/friends", { method: "POST", token: a.token, body: { nickname: b.nickname } });
    const listB = await api<{ incoming: Array<{ id: string }> }>("/friends", { token: b.token });
    await api(`/friends/${listB.incoming[0].id}/accept`, { method: "POST", token: b.token });

    await api(`/friends/pm/${b.nickname}`, { method: "POST", token: a.token, body: { body: "hello friend" } });

    const unread = await api<{ unread: number }>("/friends/pm/unread", { token: b.token });
    expect(unread.unread).toBe(1);

    await api<{ messages: Array<{ readAt: string | null }> }>(`/friends/pm/${a.nickname}`, { token: b.token });
    const unreadAfter = await api<{ unread: number }>("/friends/pm/unread", { token: b.token });
    expect(unreadAfter.unread).toBe(0);
  });
});

describe("community: media (E2E)", () => {
  it("founds a portal (50g), lists it, subscribes and adds editors", async () => {
    const owner = await register("mogul");
    await setGold(owner.id, 200);
    await setLevel(owner.id, 13); // CREATE_NEWS_PORTAL gate
    const portal = await api<{ id: string; name: string }>("/media/portal", {
      method: "POST",
      token: owner.token,
      body: { name: `E2E Herald ${owner.id.slice(-4)}` },
    });
    expect(portal.id).toBeTruthy();

    const me = await api<any>("/auth/me", { token: owner.token });
    expect(Number(me.gold)).toBe(20000 - 5000); // 200g − 50g

    const directory = await api<Array<{ id: string }>>("/media/portals", { token: owner.token });
    expect(directory.some((p) => p.id === portal.id)).toBe(true);

    const reader = await register("subscriber");
    await api(`/media/portals/${portal.id}/subscribe`, { method: "POST", token: reader.token });
    await api(`/media/portals/${portal.id}/editors`, { method: "POST", token: owner.token, body: { nickname: reader.nickname } });
    await api(`/media/portals/${portal.id}/subscribe`, { method: "DELETE", token: reader.token });
  });

  it("publishes an article, upvotes and tips it", async () => {
    const author = await register("journalist");
    await setGold(author.id, 200);
    await setLevel(author.id, 13); // portal gate
    await api("/media/portal", { method: "POST", token: author.token, body: { name: `Press Room ${author.id.slice(-4)}` } });

    const article = await api<{ id: string }>("/media/articles", {
      method: "POST",
      token: author.token,
      body: { title: "E2E Bulletin", body: "All systems nominal.", category: "WORLD" },
    });
    expect(article.id).toBeTruthy();

    const reader = await register("reader");
    await api(`/media/articles/${article.id}/upvote`, { method: "POST", token: reader.token });
    await setGold(reader.id, 50);
    await api(`/media/articles/${article.id}/tip`, { method: "POST", token: reader.token, body: { gold: 5 } });

    const feed = await api<Array<{ id: string; upvotes: number }>>("/media/articles", { token: reader.token });
    const found = feed.find((a) => a.id === article.id);
    expect(found?.upvotes).toBe(1);
  });

  it("shouts are posted and listed", async () => {
    const c = await register("shouter");
    await api("/media/shouts", { method: "POST", token: c.token, body: { content: "E2E hello world!" } });
    const shouts = await api<Array<{ content: string }>>("/media/shouts", { token: c.token });
    expect(shouts.some((s) => s.content === "E2E hello world!")).toBe(true);
  });
});

describe("community: country chat (E2E)", () => {
  it("posts and reads own country chat", async () => {
    const c = await register("chatter");
    await api(`/chat/country/${c.countryId}`, { method: "POST", token: c.token, body: { content: "chat e2e" } });
    const messages = await api<Array<{ content: string }>>(`/chat/country/${c.countryId}`, { token: c.token });
    expect(messages.some((m) => m.content === "chat e2e")).toBe(true);
  });
});

describe("community: daily tasks (E2E)", () => {
  it("lists daily tasks with completion state", async () => {
    const c = await register("taskmaster");
    const tasks = await api<Record<string, unknown>>("/actions/daily-tasks", { token: c.token });
    expect(Object.keys(tasks).length).toBeGreaterThan(0);
  });
});
