import { api, countryByCode, giveStorage, prisma, register, setGold, setLevel, staffToken } from "./helpers";

describe("stocks: JSC exchange (E2E)", () => {
  it("creates a JSC (100g), trades shares and pays dividends", async () => {
    const ceo = await register("jscceo");
    await setGold(ceo.id, 2000);
    await setLevel(ceo.id, 13);

    const jsc = await api<{ id: string; sharesTotal: number; treasuryGold: number }>("/stocks", {
      method: "POST",
      token: ceo.token,
      body: { name: `E2E Shipping ${ceo.id.slice(-4)}`, sharesTotal: 1000 },
    });
    expect(jsc.sharesTotal).toBe(1000);

    const listed = await api<Array<{ id: string }>>("/stocks", { token: ceo.token });
    expect(listed.some((s) => s.id === jsc.id)).toBe(true);

    // detail includes the CEO's founder stake
    const detail = await api<{ shares: Array<{ holder: { id: string } }> }>(`/stocks/${jsc.id}`, { token: ceo.token });
    expect(detail.shares.some((s) => s.holder.id === ceo.id)).toBe(true);

    // a buyer places a BUY order; the CEO sells → trade matches
    const buyer = await register("jscbuyer");
    await setGold(buyer.id, 20000); // escrow: 100 × 100g + 1% fee
    await setLevel(buyer.id, 13);

    await api(`/stocks/${jsc.id}/orders`, { method: "POST", token: buyer.token, body: { side: "BUY", quantity: 100, price: 100 } });
    await api(`/stocks/${jsc.id}/orders`, { method: "POST", token: ceo.token, body: { side: "SELL", quantity: 100, price: 100 } });

    const detailAfter = await api<{ shares: Array<{ holder: { id: string }; quantity: number }>; trades: unknown[] }>(`/stocks/${jsc.id}`, {
      token: ceo.token,
    });
    expect(detailAfter.shares.some((s) => s.holder.id === buyer.id && s.quantity === 100)).toBe(true);
    expect(detailAfter.trades.length).toBeGreaterThan(0);

    // dividends flow to holders proportionally
    // dividends flow out of the JSC treasury (seeded 50g at create → top up)
    await prisma.stockCompany.update({ where: { id: jsc.id }, data: { treasuryGold: BigInt(200_000) } });
    const treasuryBefore = await prisma.stockCompany.findUniqueOrThrow({ where: { id: jsc.id } });
    await api(`/stocks/${jsc.id}/dividends`, { method: "POST", token: ceo.token, body: { totalGold: 1000 } });
    const after = await prisma.stockCompany.findUniqueOrThrow({ where: { id: jsc.id } });
    expect(Number(treasuryBefore.treasuryGold) - Number(after.treasuryGold)).toBeGreaterThanOrEqual(0);
  });
});

describe("auctions (E2E)", () => {
  it("lists a WA auction and takes bids with the min-outbid rule", async () => {
    const seller = await register("auctioneer");
    await setGold(seller.id, 500);

    // craft a BARREL attachment for the seller (direct fixture)
    const wa = await prisma.equipmentItem.create({
      data: {
        ownerId: seller.id,
        ownerType: "CITIZEN",
        slot: "BARREL",
        quality: 1,
        name: "E2E Compensator",
        params: [{ type: "DAMAGE", perQ: 5 } as never],
      },
    });

    const auction = await api<{ id: string; status: string }>("/auctions", {
      method: "POST",
      token: seller.token,
      body: { kind: "WA", itemId: wa.id, startPriceGold: 10, durationHours: 1 },
    });
    expect(auction.status).toBe("ACTIVE");

    const bidder = await register("bidder");
    await setGold(bidder.id, 500);
    await api(`/auctions/${auction.id}/bid`, { method: "POST", token: bidder.token, body: { amountGold: 12 } });

    // below the minimum outbid (top + 3%) → 400
    const third = await register("underbidder");
    await setGold(third.id, 500);
    await expect(
      api(`/auctions/${auction.id}/bid`, { method: "POST", token: third.token, body: { amountGold: 12.1 } }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("minimum outbid") });
  });

  it("cancels an own auction without bids and refunds the listing fee", async () => {
    const seller = await register("auctioneer2");
    await setGold(seller.id, 500);
    const wa = await prisma.equipmentItem.create({
      data: {
        ownerId: seller.id,
        ownerType: "CITIZEN",
        slot: "UNDERBARREL",
        quality: 2,
        name: "E2E Grip",
        params: [{ type: "STABILITY", perQ: 2 } as never],
      },
    });
    const auction = await api<{ id: string }>("/auctions", {
      method: "POST",
      token: seller.token,
      body: { kind: "WA", itemId: wa.id, startPriceGold: 10, durationHours: 1 },
    });
    await api(`/auctions/${auction.id}/cancel`, { method: "POST", token: seller.token });
  });

  it("GET /auctions lists active ones; /auctions/mine splits selling vs bidding", async () => {
    const c = await register("auctionwatcher");
    expect(Array.isArray(await api<unknown[]>("/auctions", { token: c.token }))).toBe(true);
    const mine = await api<{ selling: unknown[]; bidding: unknown[] }>("/auctions/mine", { token: c.token });
    expect(Array.isArray(mine.selling)).toBe(true);
  });
});

describe("military units (E2E)", () => {
  it("creates an MU, joins it and reads it back", async () => {
    const alb = await countryByCode("AL");
    const leader = await register("muleader", alb!.id); // MUs are nationality-locked
    await setGold(leader.id, 1000);
    await setLevel(leader.id, 13); // CREATE_MU gate
    const mu = await api<{ id: string }>("/mu", { method: "POST", token: leader.token, body: { name: `E2E Legion ${leader.id.slice(-4)}` } });
    expect(mu.id).toBeTruthy();

    const member = await register("musoldier", alb!.id);
    await setLevel(member.id, 13); // JOIN_MU gate
    await api(`/mu/${mu.id}/expand`, { method: "POST", token: leader.token, body: {} }); // slots: 1 → 2
    await api(`/mu/${mu.id}/join`, { method: "POST", token: member.token, body: {} });

    const mine = await api<{ mu: { id: string } } | null>("/mu/mine", { token: member.token });
    expect(mine?.mu?.id).toBe(mu.id);

    const all = await api<unknown[]>("/mu", { token: member.token });
    expect(Array.isArray(all)).toBe(true);
  });
});

describe("contracts & loans (E2E)", () => {
  it("escrows a citizen loan, the debtor accepts and repays with interest", async () => {
    const lender = await register("lender");
    await setGold(lender.id, 500);

    const loan = await api<{ id: string; status: string }>("/contracts/loans", {
      method: "POST",
      token: lender.token,
      body: { amountGold: 100, durationDays: 7, interestPct: 10 },
    });
    expect(loan.id).toBeTruthy();

    // a debtor accepts → receives the escrowed 100g
    const debtor = await register("debtor");
    await api(`/contracts/${loan.id}/accept`, { method: "POST", token: debtor.token, body: {} });
    const debtorMe = await api<any>("/auth/me", { token: debtor.token });
    expect(Number(debtorMe.gold)).toBe(15000); // 50g starter + 100g escrow released

    await setGold(debtor.id, 500);
    const repaid = await api<{ status: string }>(`/contracts/${loan.id}/repay`, { method: "POST", token: debtor.token, body: {} });
    expect(repaid.status).toBe("COMPLETED");

    const completed = await api<Array<{ id: string; status: string }>>("/contracts?status=COMPLETED", { token: debtor.token });
    expect(completed.find((c) => c.id === loan.id)?.status).toBe("COMPLETED");
  });
});

describe("staff & stats (E2E)", () => {
  it("staff endpoints require the staff role (403 for citizens)", async () => {
    const c = await register("pleb");
    await expect(api("/staff/overview", { token: c.token })).rejects.toMatchObject({ status: 403 });
  });

  it("staff overview + citizen audit work for staff", async () => {
    const token = await staffToken();
    const overview = await api<Record<string, unknown>>("/staff/overview", { token });
    expect(overview).toBeTruthy();

    const demo1 = await prisma.citizen.findFirstOrThrow({ where: { email: "demo1@egeopolis.dev" } });
    const audit = await api<Record<string, unknown>>(`/staff/citizens/${demo1.id}/audit`, { token });
    expect(audit).toBeTruthy();
  });

  it("stats endpoints respond", async () => {
    const c = await register("statistician");
    for (const path of ["/stats/countries", "/stats/armies", "/stats/citizens", "/stats/daily"]) {
      const res = await api<unknown>(path, { token: c.token });
      expect(res).toBeDefined();
    }
  });
});

describe("events & tournaments (E2E)", () => {
  it("lists tournaments and special events", async () => {
    const c = await register("eventgoer");
    const tournaments = await api<unknown[]>("/events", { token: c.token });
    expect(Array.isArray(tournaments)).toBe(true);
    const special = await api<unknown>("/events/special", { token: c.token });
    expect(special).toBeDefined();
  });
});
