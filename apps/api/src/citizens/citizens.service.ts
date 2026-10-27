import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ACHIEVEMENT_COMPLETION_REWARD,
  ACHIEVEMENT_SUBCATEGORIES,
  FOOD_LIMIT_BASE,
  ENERGY_LIMIT_BASE,
  TICKET_TRAVEL_HP,
  militaryRank,
} from "@egeopolis/game-core";
import { Prisma, type Product, type StorageOwnerType } from "@prisma/client";
import { PrismaService, type Tx } from "../prisma/prisma.service";
import { GameService } from "../game/game.service";
import { RedisService } from "../redis/redis.service";
import { PREMIUM_PACKS, type PremiumPackKey } from "@egeopolis/game-core";

const CITIZEN = "CITIZEN" as StorageOwnerType;

@Injectable()
export class CitizensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService,
    private readonly redis: RedisService,
  ) {}

  async getProfile(id: string) {
    const citizen = await this.prisma.citizen.findUnique({
      where: { id },
      include: {
        citizenshipCountry: true,
        locationRegion: true,
        newsPortal: { select: { id: true, name: true, avatarColor: true } },
      },
    });
    if (!citizen) throw new NotFoundException("citizen not found");
    const medals = await this.prisma.medal.findMany({
      where: { citizenId: id },
      orderBy: { awardedAt: "desc" },
      take: 20,
    });
    const [likes, dislikes] = await this.prisma.$transaction([
      this.prisma.entityRating.count({ where: { targetType: "CITIZEN", targetId: id, isLike: true } }),
      this.prisma.entityRating.count({ where: { targetType: "CITIZEN", targetId: id, isLike: false } }),
    ]);
    const { passwordHash: _hash, ...safe } = citizen;
    return {
      ...safe,
      militaryRank: militaryRank(Number(citizen.totalDamage)),
      medals,
      medalCount: medals.length === 0 ? 0 : await this.prisma.medal.count({ where: { citizenId: id } }),
      rating: { likes, dislikes },
    };
  }

  /** Profile settings (wiki): avatar color, tutorial guide & toggle, 5-slot hotlist. */  async updateSettings(
    citizenId: string,
    body: { avatarColor?: string; guide?: string; enableTutorial?: boolean; shortcuts?: unknown },
  ) {
    const data: { avatarColor?: string; guide?: string; enableTutorial?: boolean; shortcuts?: string[] } = {};
    if (body.avatarColor !== undefined) {
      if (typeof body.avatarColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(body.avatarColor)) {
        throw new BadRequestException("avatarColor must be a #rrggbb hex color");
      }
      data.avatarColor = body.avatarColor;
    }
    if (body.guide !== undefined) {
      if (!["MAN", "WOMAN", "CHICKEN"].includes(body.guide)) throw new BadRequestException("guide must be MAN, WOMAN or CHICKEN");
      data.guide = body.guide;
    }
    if (body.enableTutorial !== undefined) {
      if (typeof body.enableTutorial !== "boolean") throw new BadRequestException("enableTutorial must be boolean");
      data.enableTutorial = body.enableTutorial;
    }
    if (body.shortcuts !== undefined) {
      if (!Array.isArray(body.shortcuts) || body.shortcuts.length > 5 || body.shortcuts.some((s) => typeof s !== "string" || s.length > 40)) {
        throw new BadRequestException("shortcuts must be an array of at most 5 route keys");
      }
      data.shortcuts = body.shortcuts as string[];
    }
    return this.prisma.citizen.update({
      where: { id: citizenId },
      data,
      select: { id: true, avatarColor: true, guide: true, enableTutorial: true, shortcuts: true },
    });
  }

  /** Pack catalog + the caller's premium status (wiki: Goldbuying & packs). */
  packCatalog(citizenId: string) {
    return this.prisma.citizen.findUniqueOrThrow({
      where: { id: citizenId },
      select: { premiumDaysLeft: true, firstAidKits: true },
    }).then((c) => ({ packs: PREMIUM_PACKS, premiumDaysLeft: c.premiumDaysLeft, firstAidKits: c.firstAidKits }));
  }

  /**
   * Shared-IP registration (wiki): the caller declares the 2nd account playing
   * from the same IP. Max 2 accounts per IP; both become referral-ineligible.
   */
  async registerSharedIp(mainId: string, secondAccountNickname: string) {
    if (!secondAccountNickname) throw new BadRequestException("secondAccountNickname required");
    return this.prisma.$transaction(async (tx: Tx) => {
      const main = await tx.citizen.findUniqueOrThrow({ where: { id: mainId }, select: { id: true, lastIp: true, nickname: true } });
      const second = await tx.citizen.findUnique({ where: { nickname: secondAccountNickname }, select: { id: true, lastIp: true, nickname: true } });
      if (!second) throw new NotFoundException("second account not found");
      if (second.id === main.id) throw new BadRequestException("cannot register yourself as the shared account");
      if (!main.lastIp || !second.lastIp) throw new BadRequestException("both accounts must have logged in at least once");
      if (main.lastIp !== second.lastIp) throw new ForbiddenException("accounts are not on the same IP");
      const dupes = await tx.sharedIpRegistration.count({
        where: { OR: [{ mainId: main.id }, { sharedId: main.id }, { mainId: second.id }, { sharedId: second.id }] },
      });
      if (dupes > 0) throw new ConflictException("one of the accounts is already in the shared-IP registry (max 2 per IP)");
      return tx.sharedIpRegistration.create({
        data: { mainId: main.id, sharedId: second.id, ip: main.lastIp },
      });
    });
  }

  /** Public shared-IP registry (wiki): nicknames + masked IP. */
  async sharedIpRegistry() {
    const rows = await this.prisma.sharedIpRegistration.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        main: { select: { nickname: true } },
        shared: { select: { nickname: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      main: r.main.nickname,
      shared: r.shared.nickname,
      ipMasked: r.ip.split(".").slice(0, 2).join(".") + ".*.*",
      registeredAt: r.createdAt,
    }));
  }

  /** True when either party appears in the shared-IP registry (referral exclusion). */
  private async referralBlocked(tx: Tx, aId: string, bId: string): Promise<boolean> {
    const n = await tx.sharedIpRegistration.count({
      where: { OR: [{ mainId: aId }, { sharedId: aId }, { mainId: bId }, { sharedId: bId }] },
    });
    return n > 0;
  }

  /**
   * Simulated payment gateway (wiki): buying a pack credits gold, FAKs and
   * premium days. No real money moves — the ledger records the grant.
   */
  async buyPack(citizenId: string, pack: string) {
    const cfg = PREMIUM_PACKS[pack as PremiumPackKey];
    if (!cfg) throw new BadRequestException("unknown pack (BRONZE, SILVER, GOLD)");
    return this.prisma.$transaction(async (tx: Tx) => {
      const citizen = await tx.citizen.update({
        where: { id: citizenId },
        data: {
          gold: { increment: BigInt(cfg.gold) * BigInt(100) },
          firstAidKits: { increment: cfg.firstAidKits },
          premiumDaysLeft: { increment: cfg.premiumDays },
        },
        select: { gold: true, firstAidKits: true, premiumDaysLeft: true },
      });
      await tx.transaction.create({
        data: {
          asset: "GOLD",
          reason: "OTHER",
          amount: BigInt(cfg.gold) * BigInt(100),
          toType: "CITIZEN",
          toId: citizenId,
          meta: { kind: "PACK_PURCHASE", pack, simulated: true },
        },
      });
      await this.game.notify(tx, citizenId, "PACK_PURCHASE", { pack, gold: cfg.gold, fak: cfg.firstAidKits, premiumDays: cfg.premiumDays });
      return citizen;
    });
  }
  leaderboard(orderBy: "totalDamage" | "ecoSkill" | "level" | "xp" = "totalDamage", take = 20) {
    return this.prisma.citizen.findMany({
      orderBy: { [orderBy]: "desc" },
      take,
      select: {
        id: true,
        nickname: true,
        level: true,
        totalDamage: true,
        ecoSkill: true,
        strength: true,
        citizenshipCountry: { select: { name: true, code: true, flagColor: true } },
      },
    });
  }

  async storage(citizenId: string) {
    const rows = await this.prisma.storage.findMany({
      where: { ownerType: CITIZEN, ownerId: citizenId },
      orderBy: [{ product: "asc" }, { quality: "asc" }],
    });
    return rows.filter((r) => r.quantity > 0);
  }

  async notifications(citizenId: string, take = 50) {
    return this.prisma.notification.findMany({
      where: { citizenId },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  /**
   * Travel to any region using a ticket. Higher-quality tickets lose less HP
   * (wiki: Q1 -40 … Q5 0). Free-flight equipment can make travel free.
   */
  async travel(citizenId: string, regionId: string, ticketQuality: number) {
    const agg = await this.game.equipmentAggregate(citizenId);
    return this.redis.withLock(`travel:${citizenId}`, 5000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const citizen = await tx.citizen.findUniqueOrThrow({
          where: { id: citizenId },
          include: { locationRegion: true },
        });
        const target = await tx.region.findUnique({ where: { id: regionId } });
        if (!target) throw new NotFoundException("region not found");
        if (target.id === citizen.locationRegion.id) throw new BadRequestException("already there");

        const q = Math.min(5, Math.max(1, ticketQuality || 1));
        let ticketUsed = true;
        if (Math.random() * 100 < agg.resupplyPct) {
          ticketUsed = false;
        } else {
          const has = await this.game.subtractStorage(tx, CITIZEN, citizenId, "TICKET", q, 1);
          if (!has) throw new BadRequestException(`no Q${q} ticket in storage`);
        }

        const penalty = TICKET_TRAVEL_HP[q];
        if (citizen.hp < penalty) throw new BadRequestException("not enough health for this ticket quality");
        await tx.citizen.update({
          where: { id: citizenId },
          data: { locationRegionId: regionId, hp: { decrement: penalty } },
        });
        await this.game.notify(tx, citizenId, "TRAVELED", { region: target.name, ticketUsed, penalty });
        return { ok: true, region: target.name, ticketUsed, hpLost: penalty };
      }),
    );
  }

  async worldMap() {
    const regions = await this.prisma.region.findMany({
      include: {
        country: { select: { id: true, name: true, code: true, flagColor: true } },
        _count: { select: { companies: true, buildings: true } },
        battles: { where: { status: "ACTIVE" }, select: { id: true } },
      },
      orderBy: [{ x: "asc" }, { y: "asc" }],
    });
    const countries = await this.prisma.country.findMany({
      where: { active: true },
      include: { regions: { select: { id: true } } },
    });
    const neighbors = await this.prisma.regionNeighbor.findMany();
    return { regions, countries, neighbors };
  }

  /** Achievements grouped by the 10 subcategories with completion status. */
  async achievements(citizenId: string) {
    const rows = await this.prisma.achievement.findMany({
      where: { citizenId },
      orderBy: [{ subcategory: "asc" }, { key: "asc" }],
    });
    const bySub = new Map<string, typeof rows>();
    for (const r of rows) {
      (bySub.get(r.subcategory) ?? bySub.set(r.subcategory, []).get(r.subcategory)!).push(r);
    }
    return {
      subcategories: ACHIEVEMENT_SUBCATEGORIES.map((sub) => {
        const items = bySub.get(sub) ?? [];
        const done = items.filter((i) => i.completedAt).length;
        return {
          subcategory: sub,
          total: items.length,
          completed: done,
          complete: items.length > 0 && done === items.length,
          rewardGold: ACHIEVEMENT_COMPLETION_REWARD,
          items,
        };
      }),
    };
  }
}

export type { Product };
