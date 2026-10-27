import { Injectable } from "@nestjs/common";
import {
  EMPTY_EQUIPMENT,
  FEATURE_LEVELS,
  HP_MAX,
  LEVEL_GOLD,
  REFERRAL_GOLD,
  REFERRAL_GOLD_AT_LEVEL,
  REFERRAL_PER_LEVELUP,
  REFERRAL_PER_MEDAL,
  serverDay,
  sanitizeWaParams,
  WA_CAPS,
  xpToReach as gcXpToReach,
  type EquipmentAggregate,
  type Product,
  type WaParam,
} from "@egeopolis/game-core";
import { Prisma, type StorageOwnerType } from "@prisma/client";
import { PrismaService, type Tx } from "../prisma/prisma.service";

const toCents = (gold: number) => BigInt(Math.round(gold * 100));

@Injectable()
export class GameService {
  private serverStartCache: number | null = null;

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Clock
  // ---------------------------------------------------------------------------

  async serverStart(): Promise<number> {
    if (this.serverStartCache) return this.serverStartCache;
    let clock = await this.prisma.gameClock.findUnique({ where: { id: 1 } });
    if (!clock) {
      clock = await this.prisma.gameClock.create({ data: { id: 1, serverStart: new Date() } });
    }
    this.serverStartCache = clock.serverStart.getTime();
    return this.serverStartCache;
  }

  async currentDay(): Promise<number> {
    return serverDay(await this.serverStart());
  }

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------

  async addStorage(tx: Tx, ownerType: StorageOwnerType, ownerId: string, product: Product, quality: number, qty: number) {
    await tx.storage.upsert({
      where: {
        ownerType_ownerId_product_quality: { ownerType, ownerId, product: product as never, quality },
      },
      create: { ownerType, ownerId, product: product as never, quality, quantity: BigInt(qty) },
      update: { quantity: { increment: BigInt(qty) } },
    });
  }

  async subtractStorage(tx: Tx, ownerType: StorageOwnerType, ownerId: string, product: Product, quality: number, qty: number): Promise<boolean> {
    const res = await tx.storage.updateMany({
      where: { ownerType, ownerId, product: product as never, quality, quantity: { gte: BigInt(qty) } },
      data: { quantity: { decrement: BigInt(qty) } },
    });
    return res.count > 0;
  }

  async getStorageQuantity(tx: Tx | PrismaService, ownerType: StorageOwnerType, ownerId: string, product: Product, quality: number): Promise<bigint> {
    const row = await (tx as PrismaService).storage.findUnique({
      where: { ownerType_ownerId_product_quality: { ownerType, ownerId, product: product as never, quality } },
    });
    return row?.quantity ?? BigInt(0);
  }

  // ---------------------------------------------------------------------------
  // Gold & treasury ledger
  // ---------------------------------------------------------------------------

  async moveGold(
    tx: Tx,
    from: { type: string; id: string } | null,
    to: { type: string; id: string } | null,
    amountCents: bigint,
    reason: Prisma.TransactionUncheckedCreateInput["reason"],
    meta?: Record<string, unknown>,
  ) {
    if (amountCents <= BigInt(0)) throw new Error("GOLD_AMOUNT_MUST_BE_POSITIVE");
    if (from) {
      const res = await tx.citizen.updateMany({
        where: { id: from.id, gold: { gte: amountCents } },
        data: { gold: { decrement: amountCents } },
      });
      if (res.count === 0) throw new Error("INSUFFICIENT_GOLD");
    }
    if (to) {
      await tx.citizen.update({ where: { id: to.id }, data: { gold: { increment: amountCents } } });
    }
    await tx.transaction.create({
      data: {
        asset: "GOLD",
        reason,
        amount: amountCents,
        fromType: from?.type,
        fromId: from?.id,
        toType: to?.type,
        toId: to?.id,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }

  async treasuryMove(
    tx: Tx,
    countryId: string,
    goldCents: bigint,
    reason: Prisma.TransactionUncheckedCreateInput["reason"],
    meta?: Record<string, unknown>,
  ) {
    const delta = goldCents >= BigInt(0) ? goldCents : -goldCents;
    if (goldCents < BigInt(0)) {
      const res = await tx.country.updateMany({
        where: { id: countryId, treasuryGold: { gte: delta } },
        data: { treasuryGold: { decrement: delta } },
      });
      if (res.count === 0) throw new Error("INSUFFICIENT_TREASURY_GOLD");
    } else if (delta > 0) {
      await tx.country.update({ where: { id: countryId }, data: { treasuryGold: { increment: delta } } });
    }
    await tx.transaction.create({
      data: {
        asset: "GOLD",
        reason,
        amount: goldCents,
        toType: goldCents > BigInt(0) ? "COUNTRY" : undefined,
        toId: goldCents > BigInt(0) ? countryId : undefined,
        fromType: goldCents < BigInt(0) ? "COUNTRY" : undefined,
        fromId: goldCents < BigInt(0) ? countryId : undefined,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }

  async companyWalletMove(
    tx: Tx,
    companyId: string,
    fiatCents: bigint,
    reason: Prisma.TransactionUncheckedCreateInput["reason"],
    countryId?: string,
    meta?: Record<string, unknown>,
  ) {
    const delta = fiatCents >= BigInt(0) ? fiatCents : -fiatCents;
    if (fiatCents < BigInt(0)) {
      const res = await tx.company.updateMany({
        where: { id: companyId, fiatWallet: { gte: delta } },
        data: { fiatWallet: { decrement: delta } },
      });
      if (res.count === 0) throw new Error("INSUFFICIENT_COMPANY_WALLET");
    } else if (delta > 0) {
      await tx.company.update({ where: { id: companyId }, data: { fiatWallet: { increment: delta } } });
    }
    await tx.transaction.create({
      data: {
        asset: "FIAT",
        reason,
        amount: fiatCents,
        countryId,
        toType: fiatCents > BigInt(0) ? "COMPANY" : undefined,
        toId: fiatCents > BigInt(0) ? companyId : undefined,
        fromType: fiatCents < BigInt(0) ? "COMPANY" : undefined,
        fromId: fiatCents < BigInt(0) ? companyId : undefined,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }

  async walletCredit(tx: Tx, citizenId: string, countryId: string, fiatCents: bigint, reason: Prisma.TransactionUncheckedCreateInput["reason"], meta?: Record<string, unknown>) {
    await tx.citizenWallet.upsert({
      where: { citizenId_countryId: { citizenId, countryId } },
      create: { citizenId, countryId, amount: fiatCents },
      update: { amount: { increment: fiatCents } },
    });
    await tx.transaction.create({
      data: { asset: "FIAT", reason, amount: fiatCents, toType: "CITIZEN", toId: citizenId, countryId, meta: meta as Prisma.InputJsonValue },
    });
  }

  async walletDebit(tx: Tx, citizenId: string, countryId: string, fiatCents: bigint, reason: Prisma.TransactionUncheckedCreateInput["reason"], meta?: Record<string, unknown>) {
    const res = await tx.citizenWallet.updateMany({
      where: { citizenId, countryId, amount: { gte: fiatCents } },
      data: { amount: { decrement: fiatCents } },
    });
    if (res.count === 0) throw new Error("INSUFFICIENT_WALLET");
    await tx.transaction.create({
      data: { asset: "FIAT", reason, amount: -fiatCents, fromType: "CITIZEN", fromId: citizenId, countryId, meta: meta as Prisma.InputJsonValue },
    });
  }

  async treasuryFiatCredit(tx: Tx, countryId: string, fiatCents: bigint, reason: Prisma.TransactionUncheckedCreateInput["reason"], meta?: Record<string, unknown>) {
    if (fiatCents !== BigInt(0)) {
      await tx.country.update({ where: { id: countryId }, data: { treasuryFiat: { increment: fiatCents } } });
    }
    await tx.transaction.create({
      data: {
        asset: "FIAT",
        reason,
        amount: fiatCents,
        toType: fiatCents > BigInt(0) ? "COUNTRY" : undefined,
        toId: fiatCents > BigInt(0) ? countryId : undefined,
        countryId,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }

  /** Move gold on a country's National Organisation account (wiki: gold for laws/attacks comes from the NO). */
  async orgGoldMove(
    tx: Tx,
    countryId: string,
    goldCents: bigint,
    meta?: Record<string, unknown>,
  ) {
    if (goldCents < BigInt(0)) {
      const res = await tx.nationalOrganisation.updateMany({
        where: { countryId, gold: { gte: -goldCents } },
        data: { gold: { decrement: -goldCents } },
      });
      if (res.count === 0) throw new Error("INSUFFICIENT_ORG_GOLD");
    } else if (goldCents > BigInt(0)) {
      await tx.nationalOrganisation.update({ where: { countryId }, data: { gold: { increment: goldCents } } });
    }
    await tx.transaction.create({
      data: {
        asset: "GOLD",
        reason: "OTHER",
        amount: goldCents,
        toType: goldCents > BigInt(0) ? "ORG" : undefined,
        toId: goldCents > BigInt(0) ? countryId : undefined,
        fromType: goldCents < BigInt(0) ? "ORG" : undefined,
        fromId: goldCents < BigInt(0) ? countryId : undefined,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }

  /** Move fiat on a country's National Organisation account (donations, salaries). */
  async orgFiatMove(
    tx: Tx,
    countryId: string,
    fiatCents: bigint,
    meta?: Record<string, unknown>,
  ) {
    if (fiatCents < BigInt(0)) {
      const res = await tx.nationalOrganisation.updateMany({
        where: { countryId, fiat: { gte: -fiatCents } },
        data: { fiat: { decrement: -fiatCents } },
      });
      if (res.count === 0) throw new Error("INSUFFICIENT_ORG_FIAT");
    } else if (fiatCents > BigInt(0)) {
      await tx.nationalOrganisation.update({ where: { countryId }, data: { fiat: { increment: fiatCents } } });
    }
    await tx.transaction.create({
      data: {
        asset: "FIAT",
        reason: "OTHER",
        amount: fiatCents,
        countryId,
        toType: fiatCents > BigInt(0) ? "ORG" : undefined,
        toId: fiatCents > BigInt(0) ? countryId : undefined,
        fromType: fiatCents < BigInt(0) ? "ORG" : undefined,
        fromId: fiatCents < BigInt(0) ? countryId : undefined,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Medals & notifications
  // ---------------------------------------------------------------------------

  async awardMedal(tx: Tx, citizenId: string, type: string, goldCents: number, meta?: Record<string, unknown>) {
    const cents = toCents(goldCents);
    await tx.medal.create({ data: { citizenId, type, goldPaid: goldCents, meta: meta as Prisma.InputJsonValue } });
    await tx.citizen.update({ where: { id: citizenId }, data: { gold: { increment: cents } } });
    await tx.transaction.create({
      data: { asset: "GOLD", reason: "MEDAL", amount: cents, toType: "CITIZEN", toId: citizenId, meta: { medal: type } as Prisma.InputJsonValue },
    });
    await this.notify(tx, citizenId, "MEDAL", { type, gold: goldCents });
    await this.trackAchievement(tx, citizenId, "MEDALS", "MEDAL_COUNT", 1);
    // Referral: +0.5g per medal (v2). Shared-IP accounts are excluded (wiki).
    const citizen = await tx.citizen.findUnique({ where: { id: citizenId }, select: { referrerId: true, referralMedalsPaid: true } });
    if (citizen?.referrerId && !(await this.referralBlocked(tx, citizenId, citizen.referrerId))) {
      const share = toCents(REFERRAL_PER_MEDAL);
      await tx.citizen.update({ where: { id: citizen.referrerId }, data: { gold: { increment: share } } });
      await tx.transaction.create({
        data: { asset: "GOLD", reason: "MEDAL", amount: share, toType: "CITIZEN", toId: citizen.referrerId, meta: { referralMedal: type } as Prisma.InputJsonValue },
      });
    }
  }

  async notify(tx: Tx, citizenId: string, type: string, payload: Record<string, unknown>) {
    await tx.notification.create({ data: { citizenId, type, payload: payload as Prisma.InputJsonValue } });
  }

  // ---------------------------------------------------------------------------
  // Achievements (10 subcategories; 2g bonus per 100% subcategory)
  // ---------------------------------------------------------------------------

  async trackAchievement(tx: Tx, citizenId: string, subcategory: string, key: string, progressDelta = 1, target = 1) {
    const row = await tx.achievement.upsert({
      where: { citizenId_key: { citizenId, key } },
      create: { citizenId, subcategory, key, target, progress: progressDelta },
      update: { progress: { increment: progressDelta } },
    });
    if (!row.completedAt && row.progress >= row.target) {
      await tx.achievement.update({ where: { id: row.id }, data: { completedAt: new Date() } });
      await this.notify(tx, citizenId, "ACHIEVEMENT", { key, subcategory });
      // 2g when the whole subcategory is complete.
      const all = await tx.achievement.findMany({ where: { citizenId, subcategory } });
      if (all.length > 0 && all.every((a) => a.completedAt)) {
        const cents = toCents(2);
        await tx.citizen.update({ where: { id: citizenId }, data: { gold: { increment: cents } } });
        await tx.transaction.create({
          data: { asset: "GOLD", reason: "MEDAL", amount: cents, toType: "CITIZEN", toId: citizenId, meta: { subcategoryComplete: subcategory } as Prisma.InputJsonValue },
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // XP / level-ups & referral engine
  // ---------------------------------------------------------------------------

  async applyProgress(tx: Tx, citizenId: string, gainedXp: number) {
    const citizen = await tx.citizen.findUniqueOrThrow({
      where: { id: citizenId },
      select: { xp: true, level: true, referrerId: true, referralLevelsPaid: true },
    });
    const xp = citizen.xp + gainedXp;
    let level = citizen.level;
    while (xp >= gcXpToReach(level + 1) && level < 51) level++;
    const levelsGained = Math.max(0, level - citizen.level);
    if (levelsGained === 0) {
      await tx.citizen.update({ where: { id: citizenId }, data: { xp } });
      return { levelsGained: 0, gold: 0 };
    }
    const gold = toCents(LEVEL_GOLD * levelsGained);
    await tx.citizen.update({
      where: { id: citizenId },
      data: { xp, level, hp: HP_MAX, gold: { increment: gold } },
    });
    await tx.transaction.create({
      data: { asset: "GOLD", reason: "LEVEL_UP", amount: gold, toType: "CITIZEN", toId: citizenId },
    });
    await this.notify(tx, citizenId, "LEVEL_UP", { level });
    await this.referralOnLevelUp(tx, citizenId, citizen.referrerId, citizen.referralLevelsPaid, level);
    return { levelsGained, gold: Number(gold) / 100 };
  }

  /** v2 referrals: 5g at L9 or L13 · +0.5g per level-up. Shared-IP excluded (wiki). */
  private async referralOnLevelUp(tx: Tx, citizenId: string, referrerId: string | null, paidUpTo: number, level: number) {
    if (!referrerId || (await this.referralBlocked(tx, citizenId, referrerId))) return;

    // per-level drip
    if (level > paidUpTo) {
      const drip = toCents(REFERRAL_PER_LEVELUP * (level - Math.max(paidUpTo, 1)));
      if (drip > BigInt(0)) {
        await tx.citizen.update({ where: { id: referrerId }, data: { gold: { increment: drip } } });
        await tx.transaction.create({
          data: { asset: "GOLD", reason: "LEVEL_UP", amount: drip, toType: "CITIZEN", toId: referrerId, meta: { referral: citizenId } as Prisma.InputJsonValue },
        });
      }
      await tx.citizen.update({ where: { id: citizenId }, data: { referralLevelsPaid: level } });
    }

    // milestone: 5g when the referred citizen hits L9 or L13 (once each)
    for (const milestone of [REFERRAL_GOLD_AT_LEVEL.EARLY, REFERRAL_GOLD_AT_LEVEL.LATE] as const) {
      if (level >= milestone) {
        const flag = `REFERRAL_MILESTONE_${milestone}`;
        const already = await tx.notification.findFirst({ where: { citizenId, type: flag } });
        if (!already) {
          await tx.notification.create({ data: { citizenId, type: flag, payload: {} as Prisma.InputJsonValue } });
          const cents = toCents(REFERRAL_GOLD);
          await tx.citizen.update({ where: { id: referrerId }, data: { gold: { increment: cents } } });
          await tx.citizen.update({ where: { id: citizenId }, data: { gold: { increment: cents } } });
          await tx.transaction.create({
            data: { asset: "GOLD", reason: "LEVEL_UP", amount: cents, toType: "CITIZEN", toId: referrerId, meta: { referralMilestone: milestone } as Prisma.InputJsonValue },
          });
          await this.notify(tx, citizenId, "REFERRAL_REACHED", { level: milestone });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Weapon attachment aggregation (caps applied)
  // ---------------------------------------------------------------------------

  async equipmentAggregate(citizenId: string): Promise<EquipmentAggregate> {
    const slots = await this.prisma.equippedSlot.findMany({ where: { citizenId }, include: { item: true } });
    if (slots.length === 0) return { ...EMPTY_EQUIPMENT };
    const agg: EquipmentAggregate = { ...EMPTY_EQUIPMENT };
    for (const { item } of slots) {
      // Param whitelist: clamp/drop corrupted rows before they touch combat math.
      for (const raw of sanitizeWaParams(item.params, item.quality)) {
        switch (raw.type) {
          case "HEADSHOT": agg.headshotPct += raw.value; break;
          case "RECOIL": agg.recoilReduction += raw.value; break;
          case "MAX_DAMAGE": agg.maxDamagePct += raw.value; break;
          case "MIN_DAMAGE": agg.minDamagePct += raw.value; break;
          case "STRENGTH": agg.strengthBonus += raw.value; break;
          case "PUNCH": agg.punch += raw.value; break;
          case "LUCK": agg.luckPct += raw.value; break;
          case "RESUPPLY": agg.resupplyPct += raw.value; break;
          case "GOOD_LOOKING": agg.goodLooking += raw.value; break;
        }
      }
    }
    agg.headshotPct = Math.min(WA_CAPS.headshot, agg.headshotPct);
    agg.luckPct = Math.min(WA_CAPS.luck, agg.luckPct);
    return agg;
  }

  private async referralBlocked(tx: Tx, aId: string, bId: string): Promise<boolean> {
    const n = await tx.sharedIpRegistration.count({
      where: { OR: [{ mainId: aId }, { sharedId: aId }, { mainId: bId }, { sharedId: bId }] },
    });
    return n > 0;
  }

  async activePopulation(countryId: string): Promise<number> {
    return this.prisma.citizen.count({ where: { citizenshipCountryId: countryId } });
  }

  hasFeature(citizenLevel: number, feature: keyof typeof FEATURE_LEVELS): boolean {
    return citizenLevel >= FEATURE_LEVELS[feature];
  }

  // RNG
  randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  randomFloat(min: number, max: number, decimals: number): number {
    return Number((Math.random() * (max - min) + min).toFixed(decimals));
  }
  pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }
}
