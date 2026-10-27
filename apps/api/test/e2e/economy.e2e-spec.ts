import { api, countryByCode, giveStorage, prisma, regionWithResource, register, setGold, setHp } from "./helpers";

describe("economy: companies, work, actions (E2E)", () => {
  it("creates a raw company on a matching resource region (20g)", async () => {
    const c = await register("industrialist");
    await setGold(c.id, 500);
    const usa = await countryByCode("US");
    const grainRegion = await regionWithResource(usa!.id, "GRAIN");

    const company = await api<{ id: string; name: string; gold: number }>("/companies", {
      method: "POST",
      token: c.token,
      body: { name: `Grain Co ${c.id.slice(-4)}`, product: "GRAIN", regionId: grainRegion!.id },
    });
    expect(company.id).toBeTruthy();

    const mine = await api<Array<{ id: string }>>("/companies/mine", { token: c.token });
    expect(mine.some((x) => x.id === company.id)).toBe(true);

    const me = await api<any>("/auth/me", { token: c.token });
    expect(Number(me.gold)).toBe(50000 - 2000); // 500g − 20g
  });

  it("refuses raw companies without the region resource (400)", async () => {
    const c = await register("wrongplace");
    await setGold(c.id, 500);
    const usa = await countryByCode("US");
    const plainRegion = await prisma.region.findFirst({ where: { countryId: usa!.id, resource: null } });
    await expect(
      api("/companies", { method: "POST", token: c.token, body: { name: "Oil Dream", product: "PETROL", regionId: plainRegion!.id } }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("hires a worker and a work shift produces goods, pays salary and costs HP", async () => {
    const usa = await countryByCode("US");
    const grainRegion = await regionWithResource(usa!.id, "GRAIN");

    // owner + worker are US citizens (companies can only be worked in your home country)
    const owner = await register("boss", usa!.id);
    await setGold(owner.id, 500);
    const company = await api<{ id: string }>("/companies", {
      method: "POST",
      token: owner.token,
      body: { name: `Jobs Co ${owner.id.slice(-4)}`, product: "GRAIN", regionId: grainRegion!.id },
    });
    // salaries are paid out of the company's fiat wallet — fund it (test fixture)
    await prisma.company.update({ where: { id: company.id }, data: { fiatWallet: BigInt(1_000_000) } });
    await api(`/companies/${company.id}/jobs`, { method: "POST", token: owner.token, body: { minEcoSkill: 0, salary: 1000 } });

    // worker settles in the company's region
    const worker = await register("workman", usa!.id);
    await prisma.citizen.update({ where: { id: worker.id }, data: { locationRegionId: grainRegion!.id } });
    const jobs = await api<Array<{ id: string }>>("/companies/jobs", { token: worker.token });
    const offer = jobs.find((j) => j.id);
    expect(offer).toBeTruthy();
    await api(`/companies/jobs/${offer!.id}/apply`, { method: "POST", token: worker.token });

    const before = await api<any>("/auth/me", { token: worker.token });
    const res = await api<{ units: number; product: string; netSalary: number; hpLost: number; ecoGained: number }>("/actions/work", {
      method: "POST",
      token: worker.token,
    });
    expect(res.units).toBeGreaterThan(0);
    expect(res.product).toBe("GRAIN");
    expect(res.netSalary).toBeGreaterThan(0);
    expect(res.hpLost).toBe(10);

    const after = await api<any>("/auth/me", { token: worker.token });
    expect(after.hp).toBe(before.hp - 10);
    expect(after.ecoSkill).toBeGreaterThan(before.ecoSkill);

    // double shift refused
    await expect(api("/actions/work", { method: "POST", token: worker.token })).rejects.toMatchObject({ status: 409 });
  });

  it("train raises strength once per day", async () => {
    const c = await register("cadet");
    const res = await api<{ strength: number }>("/actions/train", { method: "POST", token: c.token });
    expect(res.strength).toBeGreaterThan(0);
    await expect(api("/actions/train", { method: "POST", token: c.token })).rejects.toMatchObject({ status: 409 });
  });

  it("consume food heals up to the daily limit; FAK heals +100", async () => {
    const c = await register("hungry");
    await setHp(c.id, 100);
    await giveStorage(c.id, "FOOD", 3, 5);
    const res = await api<{ ok: boolean }>("/actions/consume", { method: "POST", token: c.token, body: { kind: "FOOD", quality: 3, qty: 1 } });
    expect(res.ok).toBe(true);
    const me = await api<any>("/auth/me", { token: c.token });
    expect(me.hp).toBeGreaterThan(100);

    await setHp(c.id, 200);
    await prisma.citizen.update({ where: { id: c.id }, data: { firstAidKits: 2 } });
    const fak = await api<{ hp: number; used: number }>("/actions/consume", { method: "POST", token: c.token, body: { kind: "FIRST_AID_KIT", quality: 0, qty: 1 } });
    expect(fak.used).toBe(1);
    expect(fak.hp).toBe(300);
  });
});

describe("economy: product market (E2E)", () => {
  it("lists, sells and buys products with local-currency settlement", async () => {
    const seller = await register("seller");
    await giveStorage(seller.id, "FOOD", 3, 50); // Q3 so starter Q1 stock doesn't skew counts
    const me = await api<any>("/auth/me", { token: seller.token });
    // the market's country = the country of the seller's location
    const marketCountry = await prisma.region.findUniqueOrThrow({ where: { id: me.locationRegionId } });

    // unitPrice is in gold (stored ×100 as minor units): 2g/unit
    const offer = await api<{ id: string; remaining: number }>("/markets/product", {
      method: "POST",
      token: seller.token,
      body: { product: "FOOD", quality: 3, unitPrice: 2, stock: 40 },
    });
    expect(offer.remaining).toBe(40);

    const offers = await api<Array<{ id: string }>>(`/markets/product?countryId=${marketCountry.countryId}&product=FOOD&quality=3`, { token: seller.token });
    expect(offers.some((o) => o.id === offer.id)).toBe(true);

    // buyer located in the same market country, funded in the local currency
    const buyer = await register("buyer");
    await prisma.citizen.update({ where: { id: buyer.id }, data: { locationRegionId: me.locationRegionId } });
    await prisma.citizenWallet.upsert({
      where: { citizenId_countryId: { citizenId: buyer.id, countryId: marketCountry.countryId } },
      update: { amount: BigInt(100_000) },
      create: { citizenId: buyer.id, countryId: marketCountry.countryId, amount: BigInt(100_000) },
    });

    await api(`/markets/product/${offer.id}/buy`, { method: "POST", token: buyer.token, body: { qty: 10 } });

    const buyerStorage = await api<Array<{ product: string; quality: number; quantity: number }>>("/citizens/me/storage", { token: buyer.token });
    expect(Number(buyerStorage.find((s) => s.product === "FOOD" && s.quality === 3)?.quantity ?? 0)).toBe(10);

    const wallet = await prisma.citizenWallet.findUniqueOrThrow({
      where: { citizenId_countryId: { citizenId: buyer.id, countryId: marketCountry.countryId } },
    });
    // 10 × 200 minor + 1% VAT = 2020 minor
    expect(Number(wallet.amount)).toBe(100_000 - 2_020);
  });

  it("refuses purchases without the market's local currency (400)", async () => {
    const seller = await register("fxseller");
    await giveStorage(seller.id, "GRAIN", 0, 10);
    const me = await api<any>("/auth/me", { token: seller.token });
    const marketCountry = await prisma.region.findUniqueOrThrow({ where: { id: me.locationRegionId } });
    const offer = await api<{ id: string }>("/markets/product", {
      method: "POST",
      token: seller.token,
      body: { product: "GRAIN", quality: 0, unitPrice: 100, stock: 10 },
    });

    // broke sits in the market country but holds no local currency
    const broke = await register("fxbroke");
    await prisma.citizen.update({ where: { id: broke.id }, data: { locationRegionId: me.locationRegionId } });
    await prisma.citizenWallet.updateMany({
      where: { citizenId: broke.id, countryId: marketCountry.countryId },
      data: { amount: 0 },
    });
    await expect(
      api(`/markets/product/${offer.id}/buy`, { method: "POST", token: broke.token, body: { qty: 5 } }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("cancels an own offer", async () => {
    const c = await register("canceller");
    await giveStorage(c.id, "GRAIN", 0, 5);
    const offer = await api<{ id: string }>("/markets/product", {
      method: "POST",
      token: c.token,
      body: { product: "GRAIN", quality: 0, unitPrice: 100, stock: 5 },
    });
    await api(`/markets/product/${offer.id}/cancel`, { method: "POST", token: c.token });
    const me = await api<any>("/auth/me", { token: c.token });
    const storage = await api<Array<{ product: string; quantity: number }>>("/citizens/me/storage", { token: c.token });
    expect(Number(storage.find((s) => s.product === "GRAIN")?.quantity ?? 0)).toBe(5); // returned to storage
  });
});
