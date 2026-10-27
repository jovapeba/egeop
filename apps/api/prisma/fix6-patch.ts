/**
 * Fix 6 corrective patch — aligns the live DB with the corrected seed rules:
 *   1. Playable raw pairs: (Grain|Sugar) + (Wood|Stone|Petrol) — no GUNPOWDER
 *      raws in playable countries (gunpowder is neutral-only per wiki).
 *      Regions + org companies + company storage are re-labelled together.
 *   2. Bridges: exactly 1 bridge region per bordering playable country
 *      (removes the old "at least 4" floor); excess bridges are deleted.
 *   3. Neutral unified currency ("Neutral Mark" / "◆"); staff country Gold / "g".
 *   4. Starter markets & monetary liquidity (wiki Category 9) per playable market.
 *
 * Idempotent — safe to re-run. Run: npx ts-node -r tsconfig-paths/register prisma/fix6-patch.ts
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { WORLD_COUNTRIES, WORLD_BORDERS, FIXED_PARTIES } from "@egeopolis/game-core";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const COMPLIANT_PAIRS: Array<[string, string]> = [
  ["GRAIN", "WOOD"], ["GRAIN", "STONE"], ["GRAIN", "PETROL"],
  ["SUGAR", "WOOD"], ["SUGAR", "STONE"], ["SUGAR", "PETROL"],
];
const FACILITY = (r: string) => (r === "GRAIN" || r === "SUGAR" ? "Farm" : r === "WOOD" ? "Lumber Camp" : r === "PETROL" ? "Oilfield" : "Quarry");

async function fixRawPairs() {
  const playables = await prisma.country.findMany({ where: { type: "PLAYABLE" }, select: { id: true, code: true, name: true } });
  let fixed = 0;
  for (const country of playables) {
    const pair = COMPLIANT_PAIRS[country.code.charCodeAt(0) % COMPLIANT_PAIRS.length];
    const raws = (await prisma.region.findMany({
      where: { countryId: country.id, kind: "RAW" },
    })).sort((a, b) => b.density.localeCompare(a.density)); // HIGH (first raw) before MEDIUM (second)
    if (raws.length !== 2) {
      console.log(`  ! ${country.code}: ${raws.length} raw regions, skipped`);
      continue;
    }
    const want = [pair[0], pair[1]];
    for (let i = 0; i < 2; i++) {
      const region = raws[i];
      if (region.resource === want[i]) continue;
      const old = region.resource;
      await prisma.region.update({ where: { id: region.id }, data: { resource: want[i] as never } });
      // Re-label the National Organisation company + its storage stock.
      const company = await prisma.company.findFirst({ where: { regionId: region.id, ownerType: "COUNTRY" } });
      if (company) {
        await prisma.company.update({
          where: { id: company.id },
          data: { product: want[i] as never, name: `${country.name} ${FACILITY(want[i])} ${region.id.slice(-4)}` },
        });
        await prisma.storage.updateMany({ where: { ownerType: "COMPANY", ownerId: company.id, product: old as never }, data: { product: want[i] as never } });
        const stock = await prisma.storage.findFirst({ where: { ownerType: "COMPANY", ownerId: company.id, product: want[i] as never } });
        if (!stock) {
          await prisma.storage.create({ data: { ownerType: "COMPANY", ownerId: company.id, product: want[i] as never, quality: 0, quantity: BigInt(2000) } });
        }
      }
      fixed++;
      console.log(`  ~ ${country.code} raw ${i === 0 ? "HIGH" : "MEDIUM"}: ${old} → ${want[i]}`);
    }
  }
  console.log(`raw pair fixes: ${fixed}`);
}

async function fixBridges() {
  const type = new Map(WORLD_COUNTRIES.map((w) => [w.code, w.type]));
  const playableNeighbors = new Map<string, number>();
  for (const [a, b] of WORLD_BORDERS) {
    if (type.get(a) === "PLAYABLE" && type.get(b) === "NEUTRAL") playableNeighbors.set(b, (playableNeighbors.get(b) ?? 0) + 1);
    if (type.get(b) === "PLAYABLE" && type.get(a) === "NEUTRAL") playableNeighbors.set(a, (playableNeighbors.get(a) ?? 0) + 1);
  }
  const neutrals = await prisma.country.findMany({ where: { type: "NEUTRAL" }, select: { id: true, code: true } });
  let deleted = 0;
  for (const neutral of neutrals) {
    const expected = playableNeighbors.get(neutral.code) ?? 0;
    const bridges = await prisma.region.findMany({
      where: { countryId: neutral.id, kind: "BRIDGE" },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true },
    });
    const excess = bridges.slice(expected);
    let removedHere = 0;
    for (const region of excess) {
      const used = await prisma.battle.count({ where: { regionId: region.id } }) +
        await prisma.citizen.count({ where: { locationRegionId: region.id } }) +
        await prisma.company.count({ where: { regionId: region.id } }) +
        await prisma.regionBuilding.count({ where: { regionId: region.id } });
      if (used > 0) {
        console.log(`  ! ${neutral.code} bridge "${region.name}" in use (${used} rows), kept`);
        continue;
      }
      await prisma.regionNeighbor.deleteMany({ where: { OR: [{ aId: region.id }, { bId: region.id }] } });
      await prisma.region.delete({ where: { id: region.id } });
      deleted++;
      removedHere++;
    }
    if (bridges.length !== expected) console.log(`  ~ ${neutral.code}: ${bridges.length} bridges → ${bridges.length - removedHere} (expected ${expected})`);
  }
  console.log(`bridge deletions: ${deleted}`);
}

async function fixCurrency() {
  const neutral = await prisma.country.updateMany({ where: { type: "NEUTRAL" }, data: { currencyName: "Neutral Mark", currencySymbol: "◆" } });
  const staff = await prisma.country.updateMany({ where: { type: "STAFF" }, data: { currencyName: "Gold", currencySymbol: "g" } });
  console.log(`currency: ${neutral.count} neutrals unified, ${staff.count} staff → Gold`);
}

async function seedStarterMarkets() {
  const playables = await prisma.country.findMany({ where: { type: "PLAYABLE" }, select: { id: true, code: true } });
  let markets = 0;
  for (const country of playables) {
    const existing = await prisma.productOffer.findFirst({ where: { countryId: country.id }, select: { id: true } });
    if (existing) continue;
    const bot = await prisma.citizen.findFirst({
      where: { citizenshipCountryId: country.id },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!bot) {
      console.log(`  ! ${country.code}: no citizen to own starter offers, skipped`);
      continue;
    }
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
          countryId: country.id,
          product: o.product,
          quality: o.quality,
          unitPrice: BigInt(Math.round(o.unitPrice * 100)),
          stock: o.stock,
          remaining: o.stock,
        },
      });
    }
    await prisma.monetaryOffer.create({
      data: {
        ownerId: bot.id,
        sellAsset: "FIAT",
        sellCountryId: country.id,
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
        buyCountryId: country.id,
      },
    });
    markets++;
  }
  console.log(`starter markets created: ${markets}`);
}

async function backfillOfficialBots() {
  // Countries seeded before the bot system (e.g. the USA in the live DB) get the
  // standard 6 official bots + congress + parties, mirroring seedPoliticsFor.
  const passwordHash = await bcrypt.hash("nationforge", 10);
  const playables = await prisma.country.findMany({ where: { type: "PLAYABLE" }, select: { id: true, name: true } });
  let createdBots = 0;
  for (const country of playables) {
    const bots: string[] = [];
    for (let i = 0; i < 6; i++) {
      const email = `founder_${country.id.slice(-6)}_${i}@egeopolis.dev`;
      const found = await prisma.citizen.findUnique({ where: { email }, select: { id: true } });
      if (found) {
        bots.push(found.id);
        continue;
      }
      const bot = await prisma.citizen.create({
        data: {
          email,
          passwordHash,
          nickname: `${country.name.split(" ")[0].slice(0, 9)}Off${i + 1}${country.id.slice(-4)}`,
          level: 15,
          xp: 1300,
          hp: 500,
          strength: 200,
          ecoSkill: 4,
          gold: BigInt(100) * BigInt(100),
          citizenshipCountryId: country.id,
          locationRegionId: (await prisma.region.findFirstOrThrow({ where: { countryId: country.id, isCapital: true } })).id,
        },
      });
      bots.push(bot.id);
      createdBots++;
    }
    const row = await prisma.country.findUniqueOrThrow({ where: { id: country.id } });
    if (!row.presidentId) await prisma.country.update({ where: { id: country.id }, data: { presidentId: bots[0] } });
    if ((await prisma.congressSeat.count({ where: { countryId: country.id } })) === 0) {
      for (let i = 0; i < 5; i++) await prisma.congressSeat.create({ data: { countryId: country.id, citizenId: bots[i + 1] ?? bots[0], electedDay: 1 } });
    }
    if ((await prisma.party.count({ where: { countryId: country.id } })) === 0) {
      for (let i = 0; i < FIXED_PARTIES.length; i++) {
        const party = await prisma.party.create({ data: { name: FIXED_PARTIES[i], countryId: country.id, leaderId: bots[i % bots.length] } });
        await prisma.partyMembership.create({ data: { partyId: party.id, citizenId: bots[i % bots.length] } });
      }
    }
  }
  console.log(`official bots backfilled: ${createdBots}`);
}

async function reassignStarterOffers() {
  // Starter offers must be owned by the country's official bot, not a real player
  // (the patch's owner lookup may have picked the oldest citizen).
  const since = new Date(Date.now() - 3_600_000);
  let moved = 0;
  for (const country of await prisma.country.findMany({ where: { type: "PLAYABLE" }, select: { id: true } })) {
    const bot = await prisma.citizen.findFirst({
      where: { citizenshipCountryId: country.id, email: { startsWith: "founder_" } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!bot) continue;
    moved += (await prisma.productOffer.updateMany({
      where: { countryId: country.id, ownerId: { not: bot.id }, createdAt: { gt: since } },
      data: { ownerId: bot.id },
    })).count;
    moved += (await prisma.monetaryOffer.updateMany({
      where: { OR: [{ sellCountryId: country.id }, { buyCountryId: country.id }], ownerId: { not: bot.id }, createdAt: { gt: since } },
      data: { ownerId: bot.id },
    })).count;
  }
  console.log(`starter offers reassigned to bots: ${moved}`);
}

async function main() {
  console.log("Fix 6 patch — raw pairs");
  await fixRawPairs();
  console.log("Fix 6 patch — bridges");
  await fixBridges();
  console.log("Fix 6 patch — currency");
  await fixCurrency();
  console.log("Fix 6 patch — official bots");
  await backfillOfficialBots();
  console.log("Fix 6 patch — starter markets");
  await seedStarterMarkets();
  console.log("Fix 6 patch — offer ownership");
  await reassignStarterOffers();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
