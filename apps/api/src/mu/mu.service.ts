import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ARMY_CREATE_COST,
  ARMY_JOIN_COOLDOWN_DAYS,
  ARMY_MAX_MEMBERS,
  ARMY_RANKS,
  armyDamageBonus,
  armySlotCost,
  armyUpgradeCostPerSlot,
  type Product,
} from "@egeopolis/game-core";
import { Prisma, type BattleSide } from "@prisma/client";
import { PrismaService, type Tx } from "../prisma/prisma.service";
import { GameService } from "../game/game.service";
import { RedisService } from "../redis/redis.service";

const GOLD = (g: number) => BigInt(Math.round(g * 100));

@Injectable()
export class MuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService,
    private readonly redis: RedisService,
  ) {}

  /** Browse-directory rows. MilitaryUnit stores leaderId/countryId without
   * relations, but the UI cards render the commander's name, country flag and
   * filter, slot capacity and damage bonus — hydrate them by hand or every
   * card shows "Commander: Unknown +NaN% Dmg" and can never be enlisted. */
  async list(countryId?: string) {
    const units = await this.prisma.militaryUnit.findMany({
      where: countryId ? { countryId } : {},
      include: { _count: { select: { members: true } } },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    const [leaders, countries] = await Promise.all([
      this.prisma.citizen.findMany({
        where: { id: { in: units.map((u) => u.leaderId) } },
        select: { id: true, nickname: true, level: true, avatarColor: true, totalDamage: true },
      }),
      this.prisma.country.findMany({
        where: { id: { in: units.map((u) => u.countryId) } },
        select: { id: true, name: true, code: true, flagColor: true },
      }),
    ]);
    return units.map((u) => ({
      ...u,
      slots: u.memberSlots,
      damageBonus: armyDamageBonus(u.levelIdx),
      leader: leaders.find((c) => c.id === u.leaderId) ?? null,
      country: countries.find((c) => c.id === u.countryId) ?? null,
    }));
  }

  /** Unit details. The roster, stats and profile are public — the vault
   * (storage) and battle orders are only exposed to the unit's own members. */
  async detail(muId: string, viewerId?: string) {
    const mu = await this.prisma.militaryUnit.findUnique({
      where: { id: muId },
      include: {
        members: { include: { citizen: { select: { id: true, nickname: true, level: true, totalDamage: true, citizenshipCountry: { select: { code: true } } } } } },
        orders: { where: { active: true } },
        _count: { select: { members: true } },
      },
    });
    if (!mu) throw new NotFoundException("army not found");
    const membership = viewerId
      ? await this.prisma.muMembership.findUnique({ where: { citizenId: viewerId } })
      : null;
    const isMember = membership?.muId === muId;
    const storage = isMember
      ? await this.prisma.storage.findMany({
          where: { ownerType: "MILITARY_UNIT", ownerId: muId },
          orderBy: [{ product: "asc" }, { quality: "asc" }],
        })
      : [];
    return {
      ...mu,
      orders: isMember ? mu.orders : [],
      storage,
      userMembership: isMember && membership ? { rank: membership.rank, joinedAt: membership.joinedAt } : null,
      damageBonus: armyDamageBonus(mu.levelIdx),
      rankName: ARMY_RANKS[mu.levelIdx].name,
      slotExpandCost: armySlotCost(mu.levelIdx),
    };
  }

  mine(citizenId: string) {
    return this.prisma.muMembership.findUnique({ where: { citizenId }, include: { mu: true } });
  }

  /** Create: 5g, level 13+, creator becomes COMMANDER with 1 slot. */
  async create(citizenId: string, name: string, description?: string) {
    if (!name?.trim() || name.length < 3) throw new BadRequestException("army name too short");
    const citizen = await this.prisma.citizen.findUniqueOrThrow({ where: { id: citizenId } });
    if (citizen.level < 13) throw new ForbiddenException("level 13 required");
    if (await this.prisma.muMembership.findUnique({ where: { citizenId } })) {
      throw new ConflictException("leave your current army first");
    }
    return this.redis.withLock(`gold:${citizenId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        await this.game.moveGold(tx, { type: "CITIZEN", id: citizenId }, null, GOLD(ARMY_CREATE_COST), "MU_CREATE");
        const mu = await tx.militaryUnit.create({
          data: { name: name.trim(), countryId: citizen.citizenshipCountryId, leaderId: citizenId, description, memberSlots: 1 },
        });
        await tx.muMembership.create({ data: { muId: mu.id, citizenId, rank: "COMMANDER" } });
        await this.game.trackAchievement(tx, citizenId, "MILITARY", "ARMY_CREATED");
        return mu;
      }),
    );
  }

  /** Join: 3-day cooldown between armies (wiki). */
  async apply(citizen: { id: string; level: number; citizenshipCountryId: string }, muId: string, message?: string) {
    if (citizen.level < 13) throw new ForbiddenException("level 13 required");
    if (await this.prisma.muMembership.findUnique({ where: { citizenId: citizen.id } })) {
      throw new ConflictException("leave your current army first");
    }
    return this.redis.withLock(`mu:${muId}`, 6000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const mu = await tx.militaryUnit.findUniqueOrThrow({ where: { id: muId } });
        if (!mu.recruitmentOpen) throw new ConflictException("recruitment closed");
        if (mu.countryOnly && mu.countryId !== citizen.citizenshipCountryId) {
          throw new ForbiddenException("this army only accepts its own nationality");
        }
        const lastLeft = await tx.notification.findFirst({
          where: { citizenId: citizen.id, type: "ARMY_LEFT" },
          orderBy: { createdAt: "desc" },
        });
        if (lastLeft && Date.now() - lastLeft.createdAt.getTime() < ARMY_JOIN_COOLDOWN_DAYS * 86_400_000) {
          throw new ConflictException(`3-day cooldown between armies`);
        }
        const count = await tx.muMembership.count({ where: { muId } });
        if (count >= Math.min(mu.memberSlots, ARMY_MAX_MEMBERS)) throw new ConflictException("army is full");
        await tx.muMembership.create({ data: { muId, citizenId: citizen.id, rank: "RECRUIT" } });
        return { ok: true };
      }),
    );
  }

  async leave(citizenId: string) {
    const membership = await this.prisma.muMembership.findUnique({ where: { citizenId }, include: { mu: true } });
    if (!membership) return { ok: true };
    if (membership.rank === "COMMANDER") {
      throw new BadRequestException("assign leadership to another member before leaving");
    }
    await this.prisma.muMembership.delete({ where: { citizenId } });
    await this.prisma.notification.create({
      data: { citizenId, type: "ARMY_LEFT", payload: { mu: membership.mu.name } as Prisma.InputJsonValue },
    });
    return { ok: true };
  }

  /** Rank upgrade: cost per slot by current rank (5/15/25g). */
  async upgrade(citizenId: string, muId: string) {
    return this.redis.withLock(`mu:${muId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const mu = await this.leaderOf(tx, citizenId, muId);
        if (mu.levelIdx >= ARMY_RANKS.length - 1) throw new BadRequestException("Elite is the top rank");
        const cost = GOLD(armyUpgradeCostPerSlot(mu.levelIdx));
        await this.game.moveGold(tx, { type: "CITIZEN", id: citizenId }, null, cost, "MU_EXPAND");
        return tx.militaryUnit.update({ where: { id: muId }, data: { levelIdx: { increment: 1 } } });
      }),
    );
  }

  /** Expand member slots: cost per slot by rank (5/10/25/50g), max 100 members. */
  async expand(citizenId: string, muId: string) {
    return this.redis.withLock(`mu:${muId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const mu = await this.leaderOf(tx, citizenId, muId);
        if (mu.memberSlots >= ARMY_MAX_MEMBERS) throw new BadRequestException("member limit is 100");
        const cost = GOLD(armySlotCost(mu.levelIdx));
        await this.game.moveGold(tx, { type: "CITIZEN", id: citizenId }, null, cost, "MU_EXPAND");
        return tx.militaryUnit.update({ where: { id: muId }, data: { memberSlots: { increment: 1 } } });
      }),
    );
  }

  async promote(citizenId: string, muId: string, targetCitizenId: string, rank: "COMMANDER" | "CAPTAIN" | "RECRUIT") {
    return this.redis.withLock(`mu:${muId}`, 6000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const mu = await this.leaderOf(tx, citizenId, muId);
        if (rank === "COMMANDER") {
          await tx.militaryUnit.update({ where: { id: muId }, data: { leaderId: targetCitizenId } });
          await tx.muMembership.update({ where: { citizenId }, data: { rank: "CAPTAIN" } });
        }
        await tx.muMembership.update({ where: { citizenId: targetCitizenId }, data: { rank } });
        await this.game.notify(tx, targetCitizenId, "ARMY_PROMOTED", { mu: mu.name, rank });
        return { ok: true };
      }),
    );
  }

  /** Set the daily campaign order (one active per army). */
  async setOrder(citizenId: string, muId: string, battleId: string, side: BattleSide) {
    return this.redis.withLock(`mu:${muId}`, 6000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        await this.officerOf(tx, citizenId, muId);
        await tx.muOrder.updateMany({ where: { muId, active: true }, data: { active: false } });
        return tx.muOrder.create({ data: { muId, battleId, side } });
      }),
    );
  }

  /** Vault: donate gold or goods. Attachment storage locked for 3-day members. */
  async donate(citizenId: string, muId: string, dto: { gold?: number; product?: Product; quality?: number; qty?: number }) {
    return this.redis.withLock(`mu:${muId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const member = await tx.muMembership.findUnique({ where: { citizenId } });
        if (!member || member.muId !== muId) throw new ForbiddenException("members only");
        if (dto.product === "SPECIAL_ITEM") {
          const joinedAt = member.joinedAt.getTime();
          if (Date.now() - joinedAt < 3 * 86_400_000) {
            throw new ForbiddenException("attachment storage unlocks after 3 days in the army");
          }
        }
        if (dto.gold && dto.gold > 0) {
          await this.game.moveGold(tx, { type: "CITIZEN", id: citizenId }, null, GOLD(dto.gold), "OTHER");
          await tx.militaryUnit.update({ where: { id: muId }, data: { gold: { increment: GOLD(dto.gold) } } });
        }
        if (dto.product && dto.qty && dto.qty > 0) {
          const q = dto.quality ?? 0;
          const took = await this.game.subtractStorage(tx, "CITIZEN", citizenId, dto.product, q, dto.qty);
          if (!took) throw new BadRequestException("not enough stock");
          await this.game.addStorage(tx, "MILITARY_UNIT", muId, dto.product, q, dto.qty);
        }
        return { ok: true };
      }),
    );
  }

  /** Automated 1-click supply: food/ammo per member from the vault. */
  async supply(citizenId: string, muId: string, perMember = 10) {
    return this.redis.withLock(`mu:${muId}`, 20000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        await this.officerOf(tx, citizenId, muId);
        const members = await tx.muMembership.findMany({ where: { muId } });
        if (members.length === 0) return { ok: true, distributed: 0 };
        let distributed = 0;
        for (const product of ["FOOD", "AMMO"] as Product[]) {
          for (const q of [1, 2, 3, 4, 5]) {
            const total = Number(await this.game.getStorageQuantity(tx, "MILITARY_UNIT", muId, product, q));
            if (total <= 0) continue;
            const per = Math.min(perMember, Math.floor(total / members.length));
            if (per <= 0) continue;
            for (const m of members) {
              await this.game.subtractStorage(tx, "MILITARY_UNIT", muId, product, q, per);
              await this.game.addStorage(tx, "CITIZEN", m.citizenId, product, q, per);
              await this.game.notify(tx, m.citizenId, "ARMY_SUPPLY", { product, quality: q, qty: per });
            }
            distributed += per * members.length;
          }
        }
        return { ok: true, distributed };
      }),
    );
  }

  /** Auto-supply salary config: army companies pay workers in goods instead of cash. */
  async configureAutoSupply(citizenId: string, muId: string, companyId: string, product: Product, quality: number, perShift: number) {
    return this.redis.withLock(`mu:${muId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        await this.leaderOf(tx, citizenId, muId);
        const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
        if (company.ownerId !== muId) throw new ForbiddenException("company must be army-owned");
        // Stored as a JobOffer note in v1: salary 0 signals goods payment.
        await tx.jobOffer.updateMany({ where: { companyId, active: true }, data: { active: false } });
        return tx.jobOffer.create({
          data: {
            companyId,
            minEcoSkill: 1,
            salary: BigInt(0),
          },
        });
      }),
    );
  }

  private async leaderOf(tx: Tx, citizenId: string, muId: string) {
    const mu = await tx.militaryUnit.findUnique({ where: { id: muId } });
    if (!mu) throw new NotFoundException("army not found");
    if (mu.leaderId !== citizenId) throw new ForbiddenException("commander only");
    return mu;
  }

  private async officerOf(tx: Tx, citizenId: string, muId: string) {
    const membership = await tx.muMembership.findUnique({ where: { citizenId } });
    if (!membership || membership.muId !== muId) throw new ForbiddenException("members only");
    if (membership.rank === "RECRUIT") throw new ForbiddenException("commander or captains only");
    return membership;
  }
}
