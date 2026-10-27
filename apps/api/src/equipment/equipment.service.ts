import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  MAX_WA_QUALITY,
  sanitizeWaParams,
  SPECIAL_ITEMS,
  WA_CAPS,
  WA_DROP_SLOTS,
  WA_MERGE_FEE,
  WA_MERGE_INGREDIENTS,
  WA_PARAM_PER_Q,
  WA_SLOTS,
  type WaParam,
  type WaParamType,
  type WaSlot,
} from "@egeopolis/game-core";
import { Prisma } from "@prisma/client";
import { PrismaService, type Tx } from "../prisma/prisma.service";
import { GameService } from "../game/game.service";
import { RedisService } from "../redis/redis.service";

const GOLD = (g: number) => BigInt(Math.round(g * 100));
/** Equipment auction fee: 2% paid by the auctioneer (wiki). */
const AUCTION_FEE = 0.02;

const WA_NAMES: Record<WaSlot, string[]> = {
  MUZZLE: ["Flash hider", "Compensator", "Muzzle brake", "Suppressor", "Linear compensator"],
  LASER: ["Red laser", "Green laser", "IR laser", "Coax laser", "Targeting laser"],
  OPTIC: ["Iron sight", "Reflex sight", "Holographic", "ACOG", "Thermal scope"],
  STOCK: ["Standard stock", "Collapsible", "Skeleton", "Precision", "Recoil dampener"],
  REAR_GRIP: ["Textured grip", "Rubber grip", "Angled grip", "Skeletal grip", "Ergo grip"],
  MAGAZINE: ["5-rounder", "10-rounder", "Extended mag", "Drum mag", "Belt feed"],
  BARREL: ["Stub barrel", "Standard barrel", "Match barrel", "Fluted barrel", "Carbon barrel"],
  UNDERBARREL: ["Rail cover", "Foregrip", "Bipod", "Grenade launcher", "Shotgun attachment"],
};

const WA_PARAM_TYPES: WaParamType[] = [
  "HEADSHOT", "RECOIL", "MAX_DAMAGE", "MIN_DAMAGE", "STRENGTH", "PUNCH", "LUCK", "RESUPPLY", "GOOD_LOOKING",
];

function paramValue(type: WaParamType, q: number): number {
  const per = WA_PARAM_PER_Q[type];
  if (!per) return 0; // unknown type — never NaN (whitelist guard)
  const jitter = 0.75 + Math.random() * 0.5; // ±25% around the per-Q value
  const v = Math.abs(per) * q * jitter;
  return Number(v.toFixed(2));
}

function pickDowngradeSlot(sourceSlot: WaSlot): WaSlot {
  const table: Partial<Record<WaSlot, Array<{ slot: WaSlot; weight: number }>>> = {
    LASER: [
      { slot: "LASER", weight: 50 },
      { slot: "OPTIC", weight: 20 },
      { slot: "BARREL", weight: 10 },
      { slot: "UNDERBARREL", weight: 10 },
      { slot: "MAGAZINE", weight: 10 },
    ],
    OPTIC: [
      { slot: "OPTIC", weight: 50 },
      { slot: "LASER", weight: 20 },
      { slot: "BARREL", weight: 10 },
      { slot: "UNDERBARREL", weight: 10 },
      { slot: "MAGAZINE", weight: 10 },
    ],
    BARREL: [
      { slot: "BARREL", weight: 50 },
      { slot: "UNDERBARREL", weight: 10 },
      { slot: "OPTIC", weight: 7.5 },
      { slot: "LASER", weight: 7.5 },
      { slot: "MUZZLE", weight: 6.25 },
      { slot: "STOCK", weight: 6.25 },
      { slot: "MAGAZINE", weight: 6.25 },
      { slot: "REAR_GRIP", weight: 6.25 },
    ],
    UNDERBARREL: [
      { slot: "UNDERBARREL", weight: 50 },
      { slot: "BARREL", weight: 10 },
      { slot: "OPTIC", weight: 7.5 },
      { slot: "LASER", weight: 7.5 },
      { slot: "MAGAZINE", weight: 6.25 },
      { slot: "REAR_GRIP", weight: 6.25 },
      { slot: "MUZZLE", weight: 6.25 },
      { slot: "STOCK", weight: 6.25 },
    ],
    MAGAZINE: [
      { slot: "MAGAZINE", weight: 50 },
      { slot: "BARREL", weight: 10 },
      { slot: "UNDERBARREL", weight: 10 },
      { slot: "STOCK", weight: 10 },
      { slot: "REAR_GRIP", weight: 7.5 },
      { slot: "MUZZLE", weight: 7.5 },
      { slot: "LASER", weight: 5 },
    ],
    REAR_GRIP: [
      { slot: "REAR_GRIP", weight: 50 },
      { slot: "MUZZLE", weight: 15 },
      { slot: "STOCK", weight: 15 },
      { slot: "MAGAZINE", weight: 15 },
      { slot: "BARREL", weight: 5 },
    ],
    MUZZLE: [
      { slot: "MUZZLE", weight: 50 },
      { slot: "REAR_GRIP", weight: 15 },
      { slot: "STOCK", weight: 15 },
      { slot: "MAGAZINE", weight: 15 },
      { slot: "UNDERBARREL", weight: 5 },
    ],
    STOCK: [
      { slot: "STOCK", weight: 50 },
      { slot: "MAGAZINE", weight: 20 },
      { slot: "REAR_GRIP", weight: 15 },
      { slot: "MUZZLE", weight: 15 },
    ],
  };

  const entries = table[sourceSlot];
  if (!entries || entries.length === 0) return sourceSlot;
  const total = entries.reduce((acc, e) => acc + e.weight, 0);
  let roll = Math.random() * total;
  for (const entry of entries) {
    if (roll < entry.weight) return entry.slot;
    roll -= entry.weight;
  }
  return entries[0].slot;
}

@Injectable()
export class EquipmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService,
    private readonly redis: RedisService,
  ) {}

  async generateItem(slot: WaSlot, quality: number) {
    if (!WA_SLOTS.includes(slot)) throw new BadRequestException("unknown attachment slot"); // whitelist guard
    const q = Math.min(MAX_WA_QUALITY, Math.max(1, quality));
    const count = Math.random() < 0.3 ? 3 : 2;
    const types = [...WA_PARAM_TYPES].sort(() => Math.random() - 0.5).slice(0, count);
    const params: WaParam[] = types.map((type) => ({ type, value: paramValue(type, q) }));
    return this.prisma.equipmentItem.create({
      data: {
        ownerType: "CITIZEN",
        ownerId: "",
        slot,
        quality: q,
        name: `${WA_NAMES[slot][q - 1]} (Q${q})`,
        params: params as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async mine(citizenId: string) {
    const items = await this.prisma.equipmentItem.findMany({
      where: { ownerType: "CITIZEN", ownerId: citizenId },
      orderBy: [{ slot: "asc" }, { quality: "asc" }],
    });
    const equipped = await this.prisma.equippedSlot.findMany({ where: { citizenId } });
    const equippedMap = Object.fromEntries(equipped.map((e) => [e.slot, e.itemId]));
    const agg = await this.game.equipmentAggregate(citizenId);
    // Effective attributes (base + gear − caps)
    const effective = {
      strength: 100 + agg.strengthBonus,
      headshotPct: Math.min(WA_CAPS.headshot, 5 + agg.headshotPct),
      recoilPct: Math.max(WA_CAPS.recoilFloor, 9.5 - agg.recoilReduction),
      luckPct: Math.min(WA_CAPS.luck, 5 + agg.luckPct),
      punch: agg.punch,
      goodLooking: agg.goodLooking,
      resupplyPct: agg.resupplyPct,
      minDamagePct: agg.minDamagePct,
      maxDamagePct: agg.maxDamagePct,
    };
    return { items, equipped: equippedMap, aggregate: agg, effective };
  }

  async equip(citizenId: string, itemId: string) {
    return this.redis.withLock(`equip:${citizenId}`, 4000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const item = await tx.equipmentItem.findUnique({ where: { id: itemId } });
        if (!item || item.ownerId !== citizenId) throw new NotFoundException("attachment not owned");
        await tx.equippedSlot.upsert({
          where: { citizenId_slot: { citizenId, slot: item.slot } },
          create: { citizenId, slot: item.slot, itemId },
          update: { itemId },
        });
        await this.game.trackAchievement(tx, citizenId, "WEAPON_ATTACHMENTS", "WA_EQUIPPED", 1, 8);
        return { ok: true, slot: item.slot };
      }),
    );
  }

  async unequip(citizenId: string, itemId: string) {
    const item = await this.prisma.equipmentItem.findUnique({ where: { id: itemId } });
    if (!item) throw new NotFoundException("attachment not found");
    await this.prisma.equippedSlot.deleteMany({ where: { citizenId, slot: item.slot } });
    return { ok: true };
  }

  /** WA Dealer upgrade: 3×Q[x] + fee → 1×Q[x+1]. */
  async merge(citizenId: string, itemIds: string[]) {
    if (!Array.isArray(itemIds) || itemIds.length !== WA_MERGE_INGREDIENTS) {
      throw new BadRequestException(`exactly ${WA_MERGE_INGREDIENTS} attachments required`);
    }
    return this.redis.withLock(`merge:${citizenId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const items = await tx.equipmentItem.findMany({ where: { id: { in: itemIds } } });
        if (items.length !== WA_MERGE_INGREDIENTS || items.some((i) => i.ownerId !== citizenId)) {
          throw new ForbiddenException("all ingredients must be owned by you");
        }
        if (new Set(items.map((i) => i.quality)).size !== 1) {
          throw new BadRequestException("ingredients must share the same quality");
        }
        const q = items[0].quality;
        if (q >= MAX_WA_QUALITY) throw new BadRequestException("Q5 is the maximum attachment quality");

        await this.game.moveGold(tx, { type: "CITIZEN", id: citizenId }, null, GOLD(WA_MERGE_FEE[q]), "MERGE_FEE");
        await tx.equipmentItem.deleteMany({ where: { id: { in: itemIds } } });
        await tx.equippedSlot.deleteMany({ where: { itemId: { in: itemIds } } });

        const newSlot = items[Math.floor(Math.random() * items.length)].slot as WaSlot;
        const created = await this.generateItem(newSlot, q + 1);
        await tx.equipmentItem.update({ where: { id: created.id }, data: { ownerId: citizenId } });
        await this.game.trackAchievement(tx, citizenId, "WEAPON_ATTACHMENTS", "WA_MERGED");
        return { ok: true, item: { ...created, ownerId: citizenId } };
      }),
    );
  }

  /** Downgrade: 1×Q[x] → 2×Q[x-1] (1 same-slot copy + 1 random per probability matrix). */
  async split(citizenId: string, itemId: string) {
    return this.redis.withLock(`split:${citizenId}`, 6000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const item = await tx.equipmentItem.findUnique({ where: { id: itemId } });
        if (!item || item.ownerId !== citizenId) throw new NotFoundException("attachment not owned");
        if (item.quality < 2 || item.quality > MAX_WA_QUALITY) {
          throw new BadRequestException("downgrade allowed for Q2..Q5");
        }
        await tx.equipmentItem.delete({ where: { id: itemId } });
        await tx.equippedSlot.deleteMany({ where: { itemId } });

        const lower = item.quality - 1;
        const copy = await tx.equipmentItem.create({
          data: {
            ownerType: "CITIZEN",
            ownerId: citizenId,
            slot: item.slot,
            quality: lower,
            name: `${WA_NAMES[item.slot][lower - 1]} (Q${lower})`,
            params: item.params as unknown as Prisma.InputJsonValue,
          },
        });
        const slot = pickDowngradeSlot(item.slot as WaSlot);
        const fresh = await this.generateItem(slot, lower);
        await tx.equipmentItem.update({ where: { id: fresh.id }, data: { ownerId: citizenId } });
        await this.game.trackAchievement(tx, citizenId, "WEAPON_ATTACHMENTS", "WA_DOWNGRADED");
        return { ok: true, items: [copy, { ...fresh, ownerId: citizenId }] };
      }),
    );
  }

  /** Consume 1 Upgrade special item to boost a parameter by 10% of total quality range. */
  async upgradeParam(citizenId: string, itemId: string, paramType: WaParamType) {
    return this.redis.withLock(`upgrade:${citizenId}`, 6000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const item = await tx.equipmentItem.findUnique({ where: { id: itemId } });
        if (!item || item.ownerId !== citizenId) throw new NotFoundException("attachment not owned");

        // Check storage for SPECIAL_ITEM (Upgrade item)
        const upgradeStock = await tx.storage.findFirst({
          where: {
            ownerType: "CITIZEN",
            ownerId: citizenId,
            product: "SPECIAL_ITEM",
            quantity: { gt: 0 },
          },
        });
        if (!upgradeStock || upgradeStock.quantity <= 0) {
          throw new BadRequestException("No Upgrade item available in your storage");
        }

        const params = sanitizeWaParams(item.params, item.quality);
        const target = params.find((p) => p.type === paramType);
        if (!target) {
          throw new BadRequestException(`Attachment does not possess parameter ${paramType}`);
        }

        const range = Math.abs(WA_PARAM_PER_Q[paramType] ?? 1);
        const delta = Number((range * 0.1).toFixed(2));
        target.value = Number((target.value + delta).toFixed(2));

        // Deduct 1 upgrade item
        if (upgradeStock.quantity <= 1n) {
          await tx.storage.delete({ where: { id: upgradeStock.id } });
        } else {
          await tx.storage.update({
            where: { id: upgradeStock.id },
            data: { quantity: { decrement: 1 } },
          });
        }

        const updated = await tx.equipmentItem.update({
          where: { id: itemId },
          data: { params: params as unknown as Prisma.InputJsonValue },
        });

        await this.game.trackAchievement(tx, citizenId, "WEAPON_ATTACHMENTS", "WA_UPGRADED");

        return { ok: true, item: updated, boostedParam: paramType, delta };
      }),
    );
  }

  /** Annual decay for Q5 attachments (called by day-change on anniversary). */
  async applyAnnualDecay() {
    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    const items = await this.prisma.equipmentItem.findMany({
      where: { quality: 5, createdAt: { lt: yearAgo } },
    });
    for (const item of items) {
      // Whitelist guard: only re-derive from known param types (never NaN).
      const params = sanitizeWaParams(item.params, item.quality).map((p) => ({
        type: p.type,
        value: paramValue(p.type, 1), // reset to Q1-minimum values
      }));
      await this.prisma.equipmentItem.update({
        where: { id: item.id },
        data: {
          params: params as unknown as Prisma.InputJsonValue,
          // Wiki: the attachment's effective quality drops with its stats.
          quality: 1,
          name: WA_NAMES[item.slot]?.[0] ?? item.name,
        },
      });
    }
    return { decayed: items.length };
  }

  // ---------------------------------------------------------------------------
  // Auction listings for attachments & special items (fixed-price v1 + bidding in /auctions)
  // ---------------------------------------------------------------------------

  listOffers(status: "ACTIVE" | "FILLED" = "ACTIVE") {
    return this.prisma.equipmentOffer.findMany({
      where: { status },
      include: { item: true, owner: { select: { id: true, nickname: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async createOffer(citizenId: string, itemId: string, priceGold: number) {
    return this.redis.withLock(`equip:${citizenId}`, 5000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const item = await tx.equipmentItem.findUnique({ where: { id: itemId } });
        if (!item || item.ownerId !== citizenId) throw new NotFoundException("attachment not owned");
        const equipped = await tx.equippedSlot.findFirst({ where: { itemId } });
        if (equipped) throw new ConflictException("unequip before listing");
        if (priceGold <= 0) throw new BadRequestException("price must be positive");
        await tx.equipmentItem.update({ where: { id: itemId }, data: { ownerId: "" } });
        return tx.equipmentOffer.create({ data: { ownerId: citizenId, itemId, price: GOLD(priceGold) } });
      }),
    );
  }

  async buyOffer(citizenId: string, offerId: string) {
    return this.redis.withLock(`offer:${offerId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const offer = await tx.equipmentOffer.findUnique({ where: { id: offerId } });
        if (!offer || offer.status !== "ACTIVE") throw new ConflictException("offer not available");
        if (offer.ownerId === citizenId) throw new BadRequestException("cannot buy your own offer");

        await this.game.moveGold(tx, { type: "CITIZEN", id: citizenId }, null, offer.price, "MARKET_PURCHASE");
        const fee = (offer.price * BigInt(Math.round(AUCTION_FEE * 10000))) / BigInt(10000);
        const proceeds = offer.price - fee;
        await tx.citizen.update({ where: { id: offer.ownerId }, data: { gold: { increment: proceeds } } });
        await tx.transaction.create({
          data: { asset: "GOLD", reason: "AUCTION_FEE", amount: fee, fromType: "OFFER", fromId: offerId },
        });
        await tx.equipmentOffer.update({ where: { id: offerId }, data: { status: "FILLED", buyerId: citizenId } });
        await tx.equipmentItem.update({ where: { id: offer.itemId }, data: { ownerId: citizenId } });
        return { ok: true, itemId: offer.itemId };
      }),
    );
  }

  async cancelOffer(citizenId: string, offerId: string) {
    return this.redis.withLock(`offer:${offerId}`, 5000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const offer = await tx.equipmentOffer.findUnique({ where: { id: offerId } });
        if (!offer || offer.ownerId !== citizenId || offer.status !== "ACTIVE") {
          throw new ConflictException("offer not cancellable");
        }
        await tx.equipmentOffer.update({ where: { id: offerId }, data: { status: "CANCELLED" } });
        await tx.equipmentItem.update({ where: { id: offer.itemId }, data: { ownerId: citizenId } });
        return { ok: true };
      }),
    );
  }

  /** Grant a battle-drop attachment to a citizen (wiki: drops only yield REAR_GRIP/MAGAZINE/MUZZLE/STOCK). */
  async grantDrop(tx: Tx, ownerId: string, quality: number) {
    const slot = WA_DROP_SLOTS[Math.floor(Math.random() * WA_DROP_SLOTS.length)] as WaSlot;
    const q = Math.min(MAX_WA_QUALITY, Math.max(1, quality));
    const count = Math.random() < 0.3 ? 3 : 2;
    const types = [...WA_PARAM_TYPES].sort(() => Math.random() - 0.5).slice(0, count);
    const params: WaParam[] = types.map((type) => ({ type, value: paramValue(type, q) }));
    return tx.equipmentItem.create({
      data: {
        ownerType: "CITIZEN",
        ownerId,
        slot,
        quality: q,
        name: `${WA_NAMES[slot][q - 1]} (Q${q})`,
        params: params as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /** Special items (Adrenalin Rush / Matrix / Upgrade) — inventory counter helpers. */
  async grantSpecial(tx: Tx, citizenId: string, key: (typeof SPECIAL_ITEMS)[number]) {
    await tx.storage.upsert({
      where: { ownerType_ownerId_product_quality: { ownerType: "CITIZEN", ownerId: citizenId, product: "SPECIAL_ITEM", quality: 0 } },
      create: { ownerType: "CITIZEN", ownerId: citizenId, product: "SPECIAL_ITEM", quality: 0, quantity: 1 },
      update: { quantity: { increment: 1 } },
    });
    void key;
    return { ok: true };
  }

  /** Tournament reward: a LASER attachment of the given quality (Q1–Q5, wiki: Q5/Q4/Q3 Laser prizes). */
  async grantLaser(tx: Tx, citizenId: string, quality: number) {
    const q = Math.min(MAX_WA_QUALITY, Math.max(1, Math.floor(quality)));
    const count = Math.random() < 0.5 ? 3 : 2;
    const types = [...WA_PARAM_TYPES].sort(() => Math.random() - 0.5).slice(0, count);
    const params = types.map((type) => ({ type, value: paramValue(type, q) })) as unknown as Prisma.InputJsonValue;
    return tx.equipmentItem.create({
      data: {
        ownerType: "CITIZEN",
        ownerId: citizenId,
        slot: "LASER",
        quality: q,
        name: `${WA_NAMES.LASER[q - 1]} (Q${q})`,
        params,
      },
    });
  }
}
