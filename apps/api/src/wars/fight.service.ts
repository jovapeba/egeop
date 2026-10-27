import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma, type BattleSide, type HitMode } from "@prisma/client";
import {
  HP_BERSERK_COST,
  HP_HIT_COST,
  XP_PER_BERSERK,
  XP_PER_HIT,
  ammoMultiplier,
  armyDamageBonus,
  baseDamage,
  effectiveAvoidChance,
  effectiveCritChance,
  effectiveHeadshot,
  effectiveMissChance,
  effectiveRecoil,
  militaryRank,
  rankDamageCap,
  rollAvoid,
  rollCrit,
  rollMiss,
  rollResupply,
  wallPercent,
} from "@egeopolis/game-core";
import { PrismaService, type Tx } from "../prisma/prisma.service";
import { GameService } from "../game/game.service";
import { RedisService } from "../redis/redis.service";
import { WarsService } from "./wars.service";

interface HitResult {
  damage: number;
  crit: boolean;
  headshot: boolean;
  missed: boolean;
  avoided: boolean;
  resupplied: boolean;
  ammoUsed: number;
  hpUsed: number;
}

@Injectable()
export class FightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService,
    private readonly redis: RedisService,
    private readonly wars: WarsService,
  ) {}

  /**
   * Single fight = 1 hit (10 HP + 1 ammo). Berserk = 5 hits (50 HP + 5 ammo).
   * Damage: ((STR·10 + Level·5 + rank%) · ammoMult · (1 + WA% + bonuses)) + punch.
   */
  async fight(
    citizen: { id: string; level: number; strength: number; citizenshipCountryId: string; locationRegionId: string; hp: number },
    battleId: string,
    side: BattleSide,
    mode: HitMode,
    ammoQuality?: number,
  ) {
    const battle = await this.prisma.battle.findUnique({
      where: { id: battleId },
      include: { war: true, region: { include: { buildings: true } } },
    });
    if (!battle || battle.status !== "ACTIVE") throw new ConflictException("battle is not active");
    const round = await this.prisma.round.findFirst({
      where: { battleId, status: "ACTIVE", endsAt: { gt: new Date() } },
    });
    if (!round) throw new ConflictException("no active round — wait for the next round to start");
    if (mode === "BERSERK" && citizen.hp < HP_BERSERK_COST) throw new BadRequestException("not enough health for a berserk");
    if (citizen.hp < HP_HIT_COST) throw new BadRequestException("not enough health");

    const eligibility = await this.wars.canFight(citizen, battle as never, side);
    if (!eligibility.ok) throw new ForbiddenException(eligibility.reason);

    const agg = await this.game.equipmentAggregate(citizen.id);
    let q = ammoQuality ? Math.min(5, Math.max(1, ammoQuality)) : null;
    if (q === null) {
      const best = await this.prisma.storage.findFirst({
        where: { ownerType: "CITIZEN", ownerId: citizen.id, product: "AMMO", quantity: { gt: 0 } },
        orderBy: { quality: "desc" },
      });
      q = best?.quality ?? 0;
    }
    // Rambo debuff: ammo usage locked (fight unarmed until the debuff expires).
    const now = new Date();
    const ramboLock = await this.prisma.buff.findFirst({
      where: { citizenId: citizen.id, type: "RAMBO", buffUntil: { lt: now }, debuffUntil: { gt: now } },
    });
    if (ramboLock) q = 0;
    const wq: number = q;
    const mult = ammoMultiplier(wq);

    const hits = await this.redis.withLock(`fight:${round.id}`, 10000, () =>
      this.prisma.$transaction(async (tx: Tx): Promise<HitResult[]> => {
        const fresh = await tx.citizen.findUniqueOrThrow({ where: { id: citizen.id } });
        let hp = fresh.hp;
        const critChance = effectiveCritChance(agg);
        const avoidChance = effectiveAvoidChance(agg);
        const missChance = effectiveMissChance(agg);

        const results: HitResult[] = [];
        const hitCount = mode === "BERSERK" ? 5 : 1;

        for (let i = 0; i < hitCount; i++) {
          const missed = rollMiss(missChance, Math.random);
          const crit = !missed && rollCrit(critChance, Math.random);
          const headshot = !missed && rollHeadshotCheck(effectiveHeadshot(agg), Math.random);
          const avoided = rollAvoid(avoidChance, Math.random);
          const resupplied = rollResupply(agg.resupplyPct, Math.random);

          let damage = 0;
          if (!missed) {
            const bonus =
              eligibility.bonusPct +
              (side === "DEFENDER" ? this.fortificationOf(battle.region.buildings) : 0) +
              (await this.buffBonus(citizen.id, side)) +
              (await this.armyOrderBonus(citizen.id, battleId, side));
            damage = Math.floor(
              baseDamage({
                strength: Number(fresh.strength),
                level: fresh.level,
                rankBonusPct: militaryRank(Number(fresh.totalDamage)).bonusPct,
                ammoMultiplier: mult * (headshot ? 2 : 1) * (1 - effectiveRecoil(agg) / 100 + 0.095),
                equip: agg,
                bonusDamagePct: bonus,
              }),
            ) * (crit ? 2 : 1);
            // Training Yard (wiki): practice hits are capped by damage rank.
            if ((battle.war.config as { training?: boolean } | null)?.training === true) {
              damage = Math.min(damage, rankDamageCap(Number(fresh.totalDamage)));
            }
          }

          const hpCost = avoided || missed ? 0 : HP_HIT_COST;
          hp = hp - hpCost;

          const ammoUsed = wq > 0 && !resupplied ? 1 : 0;
          results.push({ damage, crit, headshot, missed, avoided, resupplied, ammoUsed, hpUsed: hpCost });

          if (ammoUsed > 0) {
            const ok = await this.game.subtractStorage(tx, "CITIZEN", citizen.id, "AMMO", wq, 1);
            if (!ok) {
              // Out of ammo mid-burst → unarmed (1.0×) for the rest.
              results[results.length - 1].ammoUsed = 0;
              results[results.length - 1].damage = Math.floor(results[results.length - 1].damage / mult);
            }
          }
        }

        const totalDamage = results.reduce((s, r) => s + r.damage, 0);
        const hpUsed = results.reduce((s, r) => s + r.hpUsed, 0);
        if (hpUsed > 0 && hp < 0) throw new BadRequestException("not enough health");

        for (const r of results) {
          await tx.battleHit.create({
            data: {
              roundId: round.id,
              battleId,
              citizenId: citizen.id,
              side,
              mode,
              damage: BigInt(r.damage),
              crit: r.crit,
              missed: r.missed,
              avoided: r.avoided,
              weaponsUsed: r.ammoUsed,
              hpUsed: r.hpUsed,
            },
          });
        }
        await tx.round.update({
          where: { id: round.id },
          data: side === "ATTACKER" ? { attackerDamage: { increment: BigInt(totalDamage) } } : { defenderDamage: { increment: BigInt(totalDamage) } },
        });
        await tx.citizen.update({
          where: { id: citizen.id },
          data: { hp, totalDamage: { increment: BigInt(totalDamage) } },
        });
        await this.game.applyProgress(tx, citizen.id, mode === "BERSERK" ? XP_PER_BERSERK : XP_PER_HIT);
        await this.game.trackAchievement(tx, citizen.id, "MILITARY", "DAMAGE_DEALT", totalDamage, 100000);
        // Write-through statistics: per-citizen + per-country daily damage counters.
        const day = await this.game.currentDay();
        const rollupHits = results.length;
        await tx.statsRollup.upsert({
          where: { ownerType_ownerId_day: { ownerType: "CITIZEN", ownerId: citizen.id, day } },
          create: { ownerType: "CITIZEN", ownerId: citizen.id, day, damage: BigInt(totalDamage), hits: rollupHits },
          update: { damage: { increment: BigInt(totalDamage) }, hits: { increment: rollupHits } },
        });
        await tx.statsRollup.upsert({
          where: { ownerType_ownerId_day: { ownerType: "COUNTRY", ownerId: fresh.citizenshipCountryId, day } },
          create: { ownerType: "COUNTRY", ownerId: fresh.citizenshipCountryId, day, damage: BigInt(totalDamage), hits: rollupHits },
          update: { damage: { increment: BigInt(totalDamage) }, hits: { increment: rollupHits } },
        });
        await this.paySubsidy(tx, citizen, results.length);
        return results;
      }),
    );

    const after = await this.prisma.round.findUniqueOrThrow({ where: { id: round.id } });
    const wall = wallPercent(Number(after.attackerDamage), Number(after.defenderDamage), after.defenderFortQ);
    await this.redis.publish(`battle:${battleId}`, {
      type: "hit",
      battleId,
      roundId: round.id,
      roundNumber: round.number,
      side,
      mode,
      hits,
      wall,
      attackerDamage: Number(after.attackerDamage),
      defenderDamage: Number(after.defenderDamage),
      endsAt: after.endsAt,
    });
    return { wall, hits, totalDamage: hits.reduce((s, h) => s + h.damage, 0), hpUsed: hits.reduce((s, h) => s + h.hpUsed, 0) };
  }

  private fortificationOf(buildings: Array<{ type: string; quality: number }>): number {
    const fort = buildings.find((b) => b.type === "FORTIFICATION");
    return fort ? 0.03 * fort.quality : 0;
  }

  /** Buff engine: +10% while buffed (debuffs applied elsewhere). */
  private async buffBonus(citizenId: string, side: BattleSide): Promise<number> {
    const now = new Date();
    const buffs = await this.prisma.buff.findMany({ where: { citizenId, buffUntil: { gt: now } } });
    const debuffs = await this.prisma.buff.findMany({ where: { citizenId, debuffUntil: { gt: now }, buffUntil: { lt: now } } });
    let bonus = 0;
    for (const b of buffs) bonus += 0.1;
    for (const _b of debuffs) bonus -= 0.1;
    void side;
    return bonus;
  }
  /** Army battle order bonus (+5/10/15/20% when fighting per order). */
  private async armyOrderBonus(citizenId: string, battleId: string, side: BattleSide): Promise<number> {
    const membership = await this.prisma.muMembership.findUnique({ where: { citizenId }, include: { mu: true } });
    if (!membership) return 0;
    const order = await this.prisma.muOrder.findFirst({ where: { muId: membership.muId, battleId, side, active: true } });
    if (!order) return 0;
    return armyDamageBonus(membership.mu.levelIdx);
  }

  private async paySubsidy(tx: Tx, citizen: { id: string; citizenshipCountryId: string }, hitCount: number) {
    const subsidy = await this.prisma.subsidy.findFirst({
      where: { countryId: citizen.citizenshipCountryId, active: true },
    });
    if (!subsidy) return;
    const total = subsidy.goldPerHit * BigInt(hitCount);
    const budgetLeft = subsidy.budgetGold - subsidy.spentGold;
    const pay = total > budgetLeft ? budgetLeft : total;
    if (pay <= 0n) {
      await this.prisma.subsidy.update({ where: { id: subsidy.id }, data: { active: false } });
      return;
    }
    await this.prisma.subsidy.update({ where: { id: subsidy.id }, data: { spentGold: { increment: pay } } });
    await this.game.treasuryMove(tx, subsidy.countryId, -pay, "SUBSIDY");
    await tx.citizen.update({ where: { id: citizen.id }, data: { gold: { increment: pay } } });
    await tx.transaction.create({
      data: { asset: "GOLD", reason: "SUBSIDY", amount: pay, toType: "CITIZEN", toId: citizen.id },
    });
  }
}

function rollHeadshotCheck(headshotPct: number, rng: () => number): boolean {
  return rng() * 100 < Math.min(40, headshotPct);
}
