/**
 * eGeopolis world seed (v2 ruleset).
 * 54 playable countries (7 regions each) + 13 neutral (bridges + gunpowder) + 1 staff prison,
 * National Organisations, org-owned raw companies, 5 fixed parties per country,
 * congress bots, presidents, demo citizens.
 *
 * Run: npx ts-node -r tsconfig-paths/register prisma/seed.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import {
  WORLD_COUNTRIES,
  WORLD_BORDERS,
  FIXED_PARTIES,
} from "@egeopolis/game-core";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const FLAG_PALETTE = ["#c9543f", "#4a7de8", "#4cc38a", "#e8b44a", "#8b5cf6", "#e05561", "#38bdf8", "#f97316", "#14b8a6", "#a3e635"];

const ALL_PRODUCTS = [
  "GRAIN", "SUGAR", "GUNPOWDER", "STONE", "WOOD", "PETROL",
  "AMMO", "FOOD", "ENERGY_DRINK", "PANTRY", "FRIDGE", "HOSPITAL",
  "FORTIFICATION", "MILITARY_AIR_BASE", "MILITARY_NAVY_BASE", "TICKET",
] as const;

type Cell = { gx: number; gy: number; cx: number; cy: number };

/** 3×3 cell grid over a bbox; cells keyed (gx, gy) 0..2 */
function cellsOf(bbox: [number, number, number, number]): Cell[] {
  const [x0, y0, x1, y1] = bbox;
  const w = (x1 - x0) / 3, h = (y1 - y0) / 3;
  const out: Cell[] = [];
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      out.push({ gx, gy, cx: x0 + (gx + 0.5) * w, cy: y0 + (gy + 0.5) * h });
    }
  }
  return out;
}

const cellName = (gx: number, gy: number) => {
  const rows = ["Northern", "Central", "Southern"];
  const cols = ["Western", "Central", "Eastern"];
  const name = `${rows[gy]} ${cols[gx] === cols[1] && rows[gy] === "Central" ? "" : cols[gx]}`.trim();
  return name === "Central Central" ? "Capital District" : name;
};

async function main() {
  console.log("seeding eGeopolis v2 world…");

  const serverStart = process.env.SERVER_START ? new Date(process.env.SERVER_START) : new Date();
  await prisma.gameClock.upsert({ where: { id: 1 }, create: { id: 1, serverStart, lastDayDone: 0 }, update: {} });

  const passwordHash = await bcrypt.hash("nationforge", 10);
  const demoHash = await bcrypt.hash("demo1234", 10);

  const bordersByCode = new Map<string, string[]>();
  for (const [a, b] of WORLD_BORDERS) {
    (bordersByCode.get(a) ?? bordersByCode.set(a, []).get(a)!).push(b);
    (bordersByCode.get(b) ?? bordersByCode.set(b, []).get(b)!).push(b === b ? a : a);
  }

  let colorIdx = 0;
  const created = new Map<string, string>(); // code → countryId

  for (const wc of WORLD_COUNTRIES) {
    if (wc.type === "INACTIVE") continue;
    const existing = await prisma.country.findUnique({ where: { code: wc.code } });
    if (existing) {
      created.set(wc.code, existing.id);
      continue;
    }
    // Wiki: neutral countries share one unified currency; staff uses gold.
    const currencyName = wc.type === "STAFF" ? "Gold" : wc.type === "NEUTRAL" ? "Neutral Mark" : `${wc.code}-Coin`;
    const currencySymbol = wc.type === "STAFF" ? "g" : wc.type === "NEUTRAL" ? "◆" : "◈";
    const country = await prisma.country.create({
      data: {
        name: wc.name,
        code: wc.code,
        type: wc.type,
        svgPath: wc.d,
        flagColor: FLAG_PALETTE[colorIdx++ % FLAG_PALETTE.length],
        currencyName,
        currencySymbol,
        treasuryGold: BigInt(0),
        treasuryFiat: wc.type === "STAFF" ? BigInt(0) : BigInt(10_000) * BigInt(100),
        minSalary: BigInt(1000),
      },
    });
    created.set(wc.code, country.id);

    const cs = cellsOf(wc.bbox);
    const centroidX = (wc.bbox[0] + wc.bbox[2]) / 2;
    const centroidY = (wc.bbox[1] + wc.bbox[3]) / 2;

    if (wc.type === "STAFF") {
      await prisma.region.create({
        data: { name: "Prison", countryId: country.id, coreCountryId: country.id, kind: "PRISON", isCapital: true, x: centroidX, y: centroidY },
      });
      continue;
    }

    // --- playable: 1 capital + 2 raw + 4 non-raw --------------------------
    // Wiki: 2 raws = (Sugar or Grain) + (Wood, Stone or Petrol). Gunpowder is
    // neutral-only (Powder Basin) — it must never appear as a playable raw.
    const rawPairs: Array<[string, string]> = [
      ["GRAIN", "WOOD"], ["GRAIN", "STONE"], ["GRAIN", "PETROL"],
      ["SUGAR", "WOOD"], ["SUGAR", "STONE"], ["SUGAR", "PETROL"],
    ];
    const pair = rawPairs[wc.code.charCodeAt(0) % rawPairs.length];
    if (wc.type === "PLAYABLE") {
      const byDist = [...cs].sort((a, b) =>
        Math.hypot(a.cx - centroidX, a.cy - centroidY) - Math.hypot(b.cx - centroidX, b.cy - centroidY));
      const capital = byDist[0];
      const neighbours = cs.filter((c) => c !== capital && (Math.abs(c.gx - capital.gx) + Math.abs(c.gy - capital.gy) === 1));
      const rawA = neighbours[0] ?? byDist[1];
      const rawB = neighbours[1] ?? byDist[2];
      const rest = cs.filter((c) => c !== capital && c !== rawA && c !== rawB).slice(0, 4);

      const regions: Array<{ name: string; kind: "CAPITAL" | "RAW" | "NON_RAW"; resource: string | null; density: string; cell: Cell }> = [
        { name: `${wc.name} Capital`, kind: "CAPITAL", resource: null, density: "NONE", cell: capital },
        { name: `${wc.name} ${cellName(rawA.gx, rawA.gy)}`, kind: "RAW", resource: pair[0], density: "HIGH", cell: rawA },
        { name: `${wc.name} ${cellName(rawB.gx, rawB.gy)}`, kind: "RAW", resource: pair[1], density: "MEDIUM", cell: rawB },
        ...rest.map((cell, i) => ({
          name: `${wc.name} ${cellName(cell.gx, cell.gy)}`,
          kind: "NON_RAW" as const,
          resource: (["GRAIN", "STONE", "WOOD", "PETROL"] as const)[i % 4],
          density: "LOW",
          cell,
        })),
      ];
      let capitalRegionId = "";
      for (const r of regions) {
        const region = await prisma.region.create({
          data: {
            name: r.name,
            countryId: country.id,
            coreCountryId: country.id,
            kind: r.kind,
            isCapital: r.kind === "CAPITAL",
            isPort: r.cell.gy === 2 && r.cell.gx !== 1, // southern coastal cells = ports
            resource: (r.resource as Prisma.RegionCreateInput["resource"]) ?? null,
            density: r.density as Prisma.RegionCreateInput["density"],
            x: r.cell.cx,
            y: r.cell.cy,
            population: 120,
          },
        });
        if (r.kind === "CAPITAL") capitalRegionId = region.id;
        void capitalRegionId;
      }

      // National Organisation + taxes + org companies + parties + bots
      const org = await prisma.nationalOrganisation.create({
        data: { countryId: country.id, name: `${wc.name} National Organisation`, fiat: BigInt(10_000) * BigInt(100), gold: BigInt(100) * BigInt(100) },
      });
      for (const p of ALL_PRODUCTS) {
        await prisma.countryTax.create({
          data: { countryId: country.id, product: p, vat: 1, importTax: 1, incomeTax: 25 },
        });
      }
      const rawRegions = await prisma.region.findMany({ where: { countryId: country.id, kind: "RAW" } });
      for (const rr of rawRegions) {
        const company = await prisma.company.create({
          data: {
            name: `${wc.name} ${rr.resource === "GRAIN" || rr.resource === "SUGAR" ? "Farm" : rr.resource === "WOOD" ? "Lumber Camp" : rr.resource === "PETROL" ? "Oilfield" : "Quarry"} ${rr.id.slice(-4)}`,
            ownerId: country.id,
            ownerType: "COUNTRY",
            organisationId: org.id,
            product: rr.resource as never,
            quality: 1,
            regionId: rr.id,
            fiatWallet: BigInt(5000) * BigInt(100),
          },
        });
        await prisma.storage.create({
          data: { ownerType: "COMPANY", ownerId: company.id, product: rr.resource as never, quality: 0, quantity: BigInt(2000) },
        });
        await prisma.jobOffer.create({
          data: { companyId: company.id, minEcoSkill: 1, salary: BigInt(2500) },
        });
      }
      await seedPoliticsFor(country.id, wc.name, passwordHash);
    } else {
      // --- neutral: gunpowder middle + 1 bridge per bordering playable -----
      const neighbors = bordersByCode.get(wc.code) ?? [];
      const playableNeighbors = neighbors.filter((n) => {
        const t = WORLD_COUNTRIES.find((w) => w.code === n)?.type;
        return t === "PLAYABLE";
      });
      const center = cs.reduce((best, c) => Math.hypot(c.cx - centroidX, c.cy - centroidY) < Math.hypot(best.cx - centroidX, best.cy - centroidY) ? c : best, cs[0]);
      const sideCells = cs.filter((c) => c !== center && (c.gx === 1 || c.gy === 1)); // cross cells
      const cornerCells = cs.filter((c) => c !== center && c.gx !== 1 && c.gy !== 1);

      await prisma.region.create({
        data: {
          name: `${wc.name} Powder Basin`,
          countryId: country.id,
          coreCountryId: country.id,
          kind: "GUNPOWDER",
          resource: "GUNPOWDER",
          density: "HIGH",
          x: center.cx,
          y: center.cy,
          population: 60,
        },
      });
      const bridgeCells = [...sideCells, ...cornerCells];
      // Wiki: exactly 1 bridge region per adjacent playable border country.
      for (let i = 0; i < Math.min(bridgeCells.length, playableNeighbors.length); i++) {
        await prisma.region.create({
          data: {
            name: `${wc.name} Bridge ${i + 1}`,
            countryId: country.id,
            coreCountryId: country.id,
            kind: "BRIDGE",
            x: bridgeCells[i].cx,
            y: bridgeCells[i].cy,
            population: 40,
          },
        });
      }
    }
  }

  // Demo citizens in the United States.
  const usId = created.get("US");
  if (usId) {
    const capital = await prisma.region.findFirst({ where: { countryId: usId, isCapital: true } });
    if (capital) {
      for (let i = 0; i < 3; i++) {
        const email = `demo${i + 1}@egeopolis.dev`;
        if (await prisma.citizen.findUnique({ where: { email }, select: { id: true } })) continue;
        const citizen = await prisma.citizen.create({
          data: {
            email,
            passwordHash: demoHash,
            nickname: `DemoCitizen${i + 1}`,
            level: 13,
            xp: 760,
            hp: 500,
            strength: 120,
            ecoSkill: 2,
            gold: BigInt(100) * BigInt(100),
            citizenshipCountryId: usId,
            locationRegionId: capital.id,
          },
        });
        const kit: Array<[Prisma.StorageUncheckedCreateInput["product"], number, number]> = [
          ["FOOD", 1, 10], ["AMMO", 1, 5], ["TICKET", 2, 3],
        ];
        for (const [product, quality, qty] of kit) {
          await prisma.storage.create({
            data: { ownerType: "CITIZEN", ownerId: citizen.id, product, quality, quantity: BigInt(qty) },
          });
        }
        // Apply for a job at an org food company if present
        const foodCo = await prisma.company.findFirst({ where: { organisation: { countryId: usId }, product: "FOOD" } });
        void foodCo;
      }
    }
  }

  // ---- region neighbors: within-country cell adjacency + cross-country facing cells
  const allRegions = await prisma.region.findMany();
  const byCountry = new Map<string, typeof allRegions>();
  for (const r of allRegions) {
    (byCountry.get(r.countryId) ?? byCountry.set(r.countryId, []).get(r.countryId)!).push(r);
  }
  const pairKey = (a: string, b: string) => [a, b].sort().join("|");
  const done = new Set<string>();
  async function link(aId: string, bId: string) {
    const k = pairKey(aId, bId);
    if (done.has(k) || aId === bId) return;
    done.add(k);
    await prisma.regionNeighbor.create({ data: { aId, bId } }).catch(async () => {
      await prisma.regionNeighbor.create({ data: { aId: bId, bId: aId } }).catch(() => undefined);
    });
  }
  // within-country: connect each region to its 2 nearest same-country regions
  for (const [cid, regs] of byCountry) {
    for (const r of regs) {
      const nearest = regs
        .filter((o) => o.id !== r.id)
        .sort((a, b) => Math.hypot(a.x - r.x, a.y - r.y) - Math.hypot(b.x - r.x, b.y - r.y))
        .slice(0, 2);
      for (const n of nearest) await link(r.id, n.id);
    }
    void cid;
  }
  // cross-country: for each border pair, link the two closest regions
  for (const [a, b] of WORLD_BORDERS) {
    const ra = byCountry.get(created.get(a) ?? "") ?? [];
    const rb = byCountry.get(created.get(b) ?? "") ?? [];
    if (ra.length === 0 || rb.length === 0) continue;
    let best: [string, string, number] | null = null;
    for (const x of ra) {
      for (const y of rb) {
        const d = Math.hypot(x.x - y.x, x.y - y.y);
        if (!best || d < best[2]) best = [x.id, y.id, d];
      }
    }
    if (best && best[2] < 400) await link(best[0], best[1]);
  }

  // ---- starter markets & monetary liquidity (wiki Category 9) -------------
  // Each playable market gets a starter product set sold by the official bot,
  // plus two monetary-market liquidity offers (system-injected: sellers are
  // seeded without escrow — buying prints the sold side, as wiki intends).
  for (const wc of WORLD_COUNTRIES) {
    if (wc.type !== "PLAYABLE") continue;
    const countryId = created.get(wc.code);
    if (!countryId) continue;
    const seeded = await prisma.productOffer.findFirst({ where: { countryId }, select: { id: true } });
    if (seeded) continue;
    const bot = await prisma.citizen.findFirst({
      where: { citizenshipCountryId: countryId },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!bot) continue;
    const offers: Array<{ product: Prisma.ProductOfferCreateInput["product"]; quality: number; unitPrice: number; stock: number }> = [
      { product: "AMMO", quality: 1, unitPrice: 0.5, stock: 20_000 },
      { product: "FOOD", quality: 1, unitPrice: 0.5, stock: 2_000 },
      { product: "FOOD", quality: 2, unitPrice: 1.0, stock: 1_500 },
      { product: "FOOD", quality: 3, unitPrice: 1.5, stock: 1_000 },
      { product: "ENERGY_DRINK", quality: 1, unitPrice: 0.5, stock: 1_000 },
      { product: "ENERGY_DRINK", quality: 2, unitPrice: 1.0, stock: 750 },
      { product: "ENERGY_DRINK", quality: 3, unitPrice: 1.5, stock: 500 },
      { product: "TICKET", quality: 1, unitPrice: 1.0, stock: 500 },
    ];
    for (const o of offers) {
      await prisma.productOffer.create({
        data: {
          ownerId: bot.id,
          ownerType: "CITIZEN",
          countryId,
          product: o.product,
          quality: o.quality,
          unitPrice: BigInt(Math.round(o.unitPrice * 100)),
          stock: o.stock,
          remaining: o.stock,
        },
      });
    }
    // Monetary market: 20,000 CC @ 0.1 gold per 100 CC; 500 gold @ 15 CC per gold.
    await prisma.monetaryOffer.create({
      data: {
        ownerId: bot.id,
        sellAsset: "FIAT",
        sellCountryId: countryId,
        sellAmount: BigInt(20_000 * 100),
        remaining: BigInt(20_000 * 100),
        rate: new Prisma.Decimal("0.001"),
        buyAsset: "GOLD",
      },
    });
    await prisma.monetaryOffer.create({
      data: {
        ownerId: bot.id,
        sellAsset: "GOLD",
        sellAmount: BigInt(500 * 100),
        remaining: BigInt(500 * 100),
        rate: new Prisma.Decimal("15"),
        buyAsset: "FIAT",
        buyCountryId: countryId,
      },
    });
  }

  const counts = {
    countries: await prisma.country.count(),    regions: await prisma.region.count(),
    orgs: await prisma.nationalOrganisation.count(),
    companies: await prisma.company.count(),
    parties: await prisma.party.count(),
    citizens: await prisma.citizen.count(),
  };
  console.log("seed complete:", counts);
}

async function seedPoliticsFor(countryId: string, name: string, passwordHash: string) {
  // 5 fixed parties + 6 official bots (president + 5 congressmen).
  const bots: string[] = [];
  for (let i = 0; i < 6; i++) {
    const email = `founder_${countryId.slice(-6)}_${i}@egeopolis.dev`;
    const found = await prisma.citizen.findUnique({ where: { email }, select: { id: true } });
    const citizen = found ?? (await prisma.citizen.create({
      data: {
        email,
        passwordHash,
        nickname: `${name.split(" ")[0].slice(0, 9)}Off${i + 1}${countryId.slice(-4)}`, // always ≤20 chars & unique per country
        level: 15,
        xp: 1300,
        hp: 500,
        strength: 200,
        ecoSkill: 4,
        gold: BigInt(100) * BigInt(100),
        citizenshipCountryId: countryId,
        locationRegionId: (await prisma.region.findFirstOrThrow({ where: { countryId, isCapital: true } })).id,
        isAdmin: false,
      },
    }));
    bots.push(citizen.id);
  }
  await prisma.country.update({ where: { id: countryId }, data: { presidentId: bots[0] } });
  for (let i = 0; i < 5; i++) {
    await prisma.congressSeat.create({ data: { countryId, citizenId: bots[i + 1] ?? bots[0], electedDay: 1 } });
  }
  for (let i = 0; i < FIXED_PARTIES.length; i++) {
    const party = await prisma.party.create({
      data: { name: FIXED_PARTIES[i], countryId, leaderId: bots[i % bots.length] },
    });
    await prisma.partyMembership.create({ data: { partyId: party.id, citizenId: bots[i % bots.length] } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
