import { api, countryByCode, giveStorage, prisma, register, setGold, setHp } from "./helpers";

/** TICKET_TRAVEL_HP from the wiki: Q1 −50 … Q5 −0 */
const TICKET_TRAVEL_HP = [0, 50, 40, 30, 15, 0];

describe("citizens: travel & tickets (E2E)", () => {
  it("moves the citizen, consumes the ticket and charges HP", async () => {
    const c = await register("traveler");
    const usa = await countryByCode("US");
    const regions = await prisma.region.findMany({ where: { countryId: usa!.id }, orderBy: { name: "asc" } });
    const [from, to] = regions;

    // teleport the tester into region 1 with full HP (direct DB setup)
    await prisma.citizen.update({ where: { id: c.id }, data: { locationRegionId: from.id } });
    await setHp(c.id, 500);
    await giveStorage(c.id, "TICKET", 1, 2);

    const res = await api<{ ok: boolean; region: string; ticketUsed: boolean; hpLost: number }>("/citizens/me/travel", {
      method: "POST",
      token: c.token,
      body: { regionId: to.id, ticketQuality: 1 },
    });
    expect(res.ok).toBe(true);
    expect(res.region).toBe(to.name);
    expect(res.ticketUsed).toBe(true);
    expect(res.hpLost).toBe(TICKET_TRAVEL_HP[1]);

    const me = await api<any>("/auth/me", { token: c.token });
    expect(me.locationRegion.id).toBe(to.id);
    expect(me.hp).toBe(500 - TICKET_TRAVEL_HP[1]);

    const storage = await api<Array<{ product: string; quality: number; quantity: number }>>("/citizens/me/storage", { token: c.token });
    const tickets = storage.filter((s) => s.product === "TICKET");
    expect(tickets.reduce((a, s) => a + s.quantity, 0)).toBe(1); // 2 − 1
  });

  it("refuses travel to the current region (400 'already there')", async () => {
    const c = await register("homesick");
    const me = await api<any>("/auth/me", { token: c.token });
    await expect(
      api("/citizens/me/travel", { method: "POST", token: c.token, body: { regionId: me.locationRegion.id, ticketQuality: 5 } }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("already there") });
  });

  it("refuses travel without a matching ticket (400)", async () => {
    const c = await register("noticket");
    const usa = await countryByCode("US");
    const other = await prisma.region.findFirst({ where: { countryId: usa!.id, NOT: { id: (await api<any>("/auth/me", { token: c.token })).locationRegionId } } });
    await expect(
      api("/citizens/me/travel", { method: "POST", token: c.token, body: { regionId: other!.id, ticketQuality: 3 } }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("no Q3 ticket") });
  });

  it("refuses travel that would kill the citizen (400)", async () => {
    const c = await register("exhausted");
    await setHp(c.id, 30);
    const usa = await countryByCode("US");
    const other = await prisma.region.findFirst({ where: { countryId: usa!.id, NOT: { id: (await api<any>("/auth/me", { token: c.token })).locationRegionId } } });
    await giveStorage(c.id, "TICKET", 1, 1);
    await expect(
      api("/citizens/me/travel", { method: "POST", token: c.token, body: { regionId: other!.id, ticketQuality: 1 } }),
    ).rejects.toMatchObject({ status: 400, message: expect.stringContaining("not enough health") });
  });

  it("Q5 first-class tickets cost no HP", async () => {
    const c = await register("firstclass");
    const usa = await countryByCode("US");
    const regions = await prisma.region.findMany({ where: { countryId: usa!.id }, orderBy: { name: "asc" } });
    await prisma.citizen.update({ where: { id: c.id }, data: { locationRegionId: regions[0].id } });
    await giveStorage(c.id, "TICKET", 5, 1);
    const res = await api<{ hpLost: number; ticketUsed: boolean }>("/citizens/me/travel", {
      method: "POST",
      token: c.token,
      body: { regionId: regions[1].id, ticketQuality: 5 },
    });
    expect(res.hpLost).toBe(0);
  });
});

describe("citizens: storage, notifications, world (E2E)", () => {
  it("GET /citizens/me/storage lists granted items", async () => {
    const c = await register("stockpiler");
    await giveStorage(c.id, "FOOD", 2, 7);
    const storage = await api<Array<{ product: string; quality: number; quantity: number }>>("/citizens/me/storage", { token: c.token });
    const food = storage.find((s) => s.product === "FOOD" && s.quality === 2);
    expect(Number(food?.quantity)).toBe(7);
  });

  it("travel writes a TRAVELED notification", async () => {
    const c = await register("notified");
    const usa = await countryByCode("US");
    const regions = await prisma.region.findMany({ where: { countryId: usa!.id }, orderBy: { name: "asc" } });
    await prisma.citizen.update({ where: { id: c.id }, data: { locationRegionId: regions[0].id } });
    await giveStorage(c.id, "TICKET", 2, 1);
    await api("/citizens/me/travel", { method: "POST", token: c.token, body: { regionId: regions[1].id, ticketQuality: 2 } });

    const notes = await api<Array<{ type: string }>>("/citizens/me/notifications", { token: c.token });
    expect(notes.some((n) => n.type === "TRAVELED")).toBe(true);
  });

  it("GET /citizens/map returns regions and countries", async () => {
    const c = await register("cartographer");
    const map = await api<{ regions: unknown[]; countries: unknown[] }>("/citizens/map", { token: c.token });
    expect(map.regions.length).toBeGreaterThan(300);
    expect(map.countries.length).toBeGreaterThanOrEqual(60);
  });

  it("GET /citizens/me/achievements exposes the 10 subcategories", async () => {
    const c = await register("achiever");
    const res = await api<{ subcategories: string[] }>("/citizens/me/achievements", { token: c.token });
    expect(res.subcategories).toHaveLength(10);
  });

  it("GET /citizens/leaderboard is readable", async () => {
    const c = await register("racer");
    const lb = await api<unknown[]>("/citizens/leaderboard", { token: c.token });
    expect(Array.isArray(lb)).toBe(true);
    expect(lb.length).toBeGreaterThan(0);
  });
});

describe("citizens: premium packs (E2E)", () => {
  it("lists the 3 wiki packs", async () => {
    const c = await register("shopper");
    const res = await api<{ packs: Record<string, { gold: number; firstAidKits: number; premiumDays: number }> }>("/citizens/me/packs", { token: c.token });
    expect(Object.keys(res.packs).sort()).toEqual(["BRONZE", "GOLD", "SILVER"]);
  });

  it("buying BRONZE grants 10g + 5 FAKs + 7 premium days", async () => {
    const c = await register("packbuyer");
    await setGold(c.id, 100);
    const res = await api<{ gold: number; firstAidKits: number; premiumDaysLeft: number }>("/citizens/me/packs/BRONZE", { method: "POST", token: c.token });
    expect(Number(res.gold)).toBe(11000); // 100g + 10g pack reward
    expect(res.firstAidKits).toBeGreaterThanOrEqual(5);
    expect(res.premiumDaysLeft).toBeGreaterThanOrEqual(7);
  });

  it("buying GOLD grants 90 premium days and 40 FAKs", async () => {
    const c = await register("goldpack");
    const res = await api<{ premiumDaysLeft: number; firstAidKits: number }>("/citizens/me/packs/GOLD", { method: "POST", token: c.token });
    expect(res.premiumDaysLeft).toBeGreaterThanOrEqual(90);
    expect(res.firstAidKits).toBeGreaterThanOrEqual(40);
  });
});

describe("citizens: shared-IP registry (E2E)", () => {
  it("registers a 2nd account on the same IP and lists it", async () => {
    const main = await register("ipuser");
    const second = await register("ipuser2");
    await api("/citizens/me/shared-ip", {
      method: "POST",
      token: main.token,
      body: { secondAccountNickname: second.nickname },
    });
    const list = await api<Array<{ main: string; shared: string; ip: string }>>("/citizens/shared-ip", { token: main.token });
    expect(list.some((r) => r.main === main.nickname && r.shared === second.nickname)).toBe(true);
  });
});
