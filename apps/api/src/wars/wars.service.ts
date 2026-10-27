import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ATTACK_REGION_COST_NEUTRAL,
  ATTACK_REGION_COST_PLAYABLE,
  battleDropCounts,
  BATTLE_HERO_GOLD,
  CAMPAIGN_HERO_GOLD,
  CIVIL_BASE_COST,
  CIVIL_COOLDOWN_DAYS,
  CIVIL_MIN_LEVEL,
  CIVIL_POLL_HOURS,
  CIVIL_ROUND_DURATION_SECONDS,
  CIVIL_SUPPORT_RATIO,
  CONGRESS_SEATS,
  DOW_ATTACK_WINDOW_HOURS,
  HALLOWEEN_ROUND_SECONDS,
  KOTH_REWARD_GOLD,
  MAX_ROUNDS,
  RESISTANCE_HERO_GOLD,
  ROUNDS_TO_WIN,
  ROUND_DURATION_SECONDS,
  RW_COOLDOWN_MINUTES,
  RW_COST,
  RW_MIN_LEVEL,
  TRAINING_ROUND_SECONDS,
  UPGRADE_ITEM_DROP_HITS,
  WALL_START,
  WAR_INITIATIVE_HOURS,
  wallPercent,
} from "@egeopolis/game-core";
import { Prisma, type BattleSide, type WarType, type War } from "@prisma/client";
import { PrismaService, type Tx } from "../prisma/prisma.service";
import { GameService } from "../game/game.service";
import { RedisService } from "../redis/redis.service";
import { EquipmentService } from "../equipment/equipment.service";

const GOLD = (g: number) => BigInt(Math.round(g * 100));

/** Round duration: CIVIL has its own; special-event wars may override via config. */
function roundSeconds(war: { type: WarType; config: unknown }): number {
  if (war.type === "CIVIL") return CIVIL_ROUND_DURATION_SECONDS;
  const cfg = war.config as { roundSeconds?: number } | null;
  return cfg?.roundSeconds ?? ROUND_DURATION_SECONDS;
}

@Injectable()
export class WarsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService,
    private readonly redis: RedisService,
    private readonly equipment: EquipmentService,
  ) {}

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  listWars(status?: "ACTIVE" | "ENDED") {
    return this.prisma.war.findMany({
      where: status ? { status } : { status: "ACTIVE" },
      include: {
        attackerCountry: { select: { id: true, name: true, code: true, flagColor: true } },
        defenderCountry: { select: { id: true, name: true, code: true, flagColor: true } },
        battles: { where: { status: "ACTIVE" }, select: { id: true, regionId: true, region: { select: { name: true } } } },
      },
      orderBy: { startedAt: "desc" },
      take: 50,
    });
  }

  async warDetail(warId: string) {
    const war = await this.prisma.war.findUnique({
      where: { id: warId },
      include: {
        attackerCountry: { select: { id: true, name: true, code: true, flagColor: true } },
        defenderCountry: { select: { id: true, name: true, code: true, flagColor: true } },
        battles: { orderBy: { startedAt: "desc" }, include: { region: true } },
      },
    });
    if (!war) throw new NotFoundException("war not found");
    return war;
  }

  async battleDetail(battleId: string) {
    const battle = await this.prisma.battle.findUnique({
      where: { id: battleId },
      include: {
        war: {
          include: {
            attackerCountry: { select: { id: true, name: true, code: true, flagColor: true } },
            defenderCountry: { select: { id: true, name: true, code: true, flagColor: true } },
          },
        },
        region: { include: { country: true } },
        rounds: { orderBy: { number: "desc" }, take: 20 },
      },
    });
    if (!battle) throw new NotFoundException("battle not found");
    const current = battle.rounds.find((r) => r.status === "ACTIVE") ?? battle.rounds[0];
    const wall = current
      ? wallPercent(Number(current.attackerDamage), Number(current.defenderDamage), current.defenderFortQ)
      : WALL_START;
    const top = await this.prisma.battleHit.groupBy({
      by: ["citizenId", "side"],
      where: { battleId },
      _sum: { damage: true },
      orderBy: { _sum: { damage: "desc" } },
    });
    const citizens = await this.prisma.citizen.findMany({
      where: { id: { in: top.map((t) => t.citizenId) } },
      select: { id: true, nickname: true, citizenshipCountry: { select: { name: true, code: true, flagColor: true } } },
    });
    const nameById = Object.fromEntries(citizens.map((c) => [c.id, c]));
    return {
      battle,
      wall,
      topFighters: top.map((t) => ({
        citizen: nameById[t.citizenId] ?? { id: t.citizenId, nickname: "unknown" },
        side: t.side,
        damage: t._sum.damage ?? 0,
      })),
    };
  }

  // ===========================================================================
  // WAR LIFECYCLE
  // ===========================================================================

  isPresident(citizen: { id: string }, countryId: string) {
    return this.prisma.country.findFirst({ where: { id: countryId, presidentId: citizen.id } }).then(Boolean);
  }

  /** Law executor for war-typed laws (called by PoliticsService after a vote passes). */
  async executeLaw(tx: Tx, type: "DECLARE_WAR" | "ATTACK_REGION", payload: Record<string, any>, countryId: string) {
    if (type === "DECLARE_WAR") {
      const defenderCountryId = String(payload.defenderCountryId);
      await this.validateDirectWar(countryId, defenderCountryId);
      await this.game.treasuryMove(tx, countryId, -GOLD(30), "WAR_DECLARE");
      // King of the Hill: wars against the hill during the event carry the koth flag.
      const koth = await this.prisma.specialEvent.findFirst({ where: { type: "KOTH", status: "ACTIVE" }, select: { config: true } });
      const hillCountryId = koth ? (koth.config as { countryId?: string }).countryId : null;
      const war = await tx.war.create({
        data: {
          type: "DIRECT",
          attackerCountryId: countryId,
          defenderCountryId,
          ...(hillCountryId === defenderCountryId ? { config: { koth: true } as never } : {}),
        },
      });
      return war;
    }
    if (type === "ATTACK_REGION") {
      const warId = String(payload.warId);
      const regionId = String(payload.regionId);
      const war = await tx.war.findUniqueOrThrow({ where: { id: warId } });
      if (war.status !== "ACTIVE") throw new BadRequestException("war already ended");
      const region = await tx.region.findUniqueOrThrow({ where: { id: regionId } });
      await this.validateAttack(war, region, countryId);
      const isNeutralRegion = (await tx.region.findUniqueOrThrow({ where: { id: regionId }, select: { country: { select: { type: true } } } })).country.type === "NEUTRAL";
      const cost = GOLD(isNeutralRegion ? ATTACK_REGION_COST_NEUTRAL : ATTACK_REGION_COST_PLAYABLE);
      await this.game.treasuryMove(tx, countryId, -cost, "REGION_ATTACK");
      const battle = await this.createBattle(tx, war, region);
      return battle;
    }
  }

  private async validateDirectWar(attackerCountryId: string, defenderCountryId: string) {
    if (attackerCountryId === defenderCountryId) throw new BadRequestException("cannot declare war on yourself");
    const active = await this.prisma.war.count({
      where: {
        status: "ACTIVE",
        OR: [
          { attackerCountryId: attackerCountryId, defenderCountryId },
          { attackerCountryId: defenderCountryId, defenderCountryId: attackerCountryId },
        ],
      },
    });
    if (active > 0) throw new ConflictException("war already active between these countries");
    // Allies and NAP/MDMA treaty partners are protected (wiki: wars cannot be declared on allies).
    const memberships = await this.prisma.allianceMember.findMany({
      where: { countryId: { in: [attackerCountryId, defenderCountryId] } },
      select: { allianceId: true, countryId: true },
    });
    const a = memberships.find((m) => m.countryId === attackerCountryId)?.allianceId;
    const b = memberships.find((m) => m.countryId === defenderCountryId)?.allianceId;
    if (a && b && a === b) throw new ForbiddenException("cannot declare war on a country in the same alliance");
    const treaty = await this.prisma.treaty.findFirst({
      where: {
        active: true,
        type: { in: ["NAP", "MDMA"] },
        OR: [
          { countryAId: attackerCountryId, countryBId: defenderCountryId },
          { countryAId: defenderCountryId, countryBId: attackerCountryId },
        ],
      },
    });
    if (treaty) throw new ForbiddenException(`a ${treaty.type} treaty is active between these countries`);
    const shares = await this.prisma.region.count({
      where: { countryId: attackerCountryId, neighborsA: { some: { b: { countryId: defenderCountryId } } } },
    });
    const sharesB = await this.prisma.region.count({
      where: { countryId: defenderCountryId, neighborsA: { some: { b: { countryId: attackerCountryId } } } },
    });
    if (shares + sharesB === 0) {
      // King of the Hill: the hill borders nothing — any country may DoW it during the event.
      const koth = await this.prisma.specialEvent.findFirst({ where: { type: "KOTH", status: "ACTIVE" }, select: { config: true } });
      const hillCountryId = koth ? (koth.config as { countryId?: string }).countryId : null;
      if (!hillCountryId || hillCountryId !== defenderCountryId) throw new BadRequestException("countries must share a border");
    }
  }

  /**
   * Attack validation (wiki: Conquering regions):
   * - within 24h after the DoW only the declarer may attack (DOW_ATTACK_WINDOW_HOURS);
   * - after a battle ends the winner holds a 24h initiative (WAR_INITIATIVE_HOURS);
   * - the attacking country must border the target region.
   */
  private async validateAttack(war: War, region: { id: string; countryId: string }, actorCountryId: string) {
    if (war.type === "RESISTANCE" || war.type === "CIVIL") throw new BadRequestException("only direct wars can attack regions");
    if (actorCountryId !== war.attackerCountryId && actorCountryId !== war.defenderCountryId) {
      throw new ForbiddenException("only war participants can attack");
    }
    const isAttacker = actorCountryId === war.attackerCountryId;
    const targetCountryId = isAttacker ? war.defenderCountryId : war.attackerCountryId!;
    if (region.countryId !== targetCountryId) {
      throw new BadRequestException(isAttacker
        ? "region is not owned by the war defender"
        : "region is not owned by the war attacker");
    }
    // Within 24h of the DoW only the declarer (war attacker) has the right to attack.
    const dowWindowEnd = new Date(war.startedAt.getTime() + DOW_ATTACK_WINDOW_HOURS * 3_600_000);
    if (!isAttacker && new Date() < dowWindowEnd) {
      throw new ForbiddenException("the declaring country has the attack initiative for 24h");
    }
    // After a battle the winner holds a 24h initiative.
    if (war.initiativeUntil && new Date() < war.initiativeUntil && war.initiativeCountryId !== actorCountryId) {
      throw new ForbiddenException("the last battle winner holds the initiative for 24h");
    }
    const activeBattle = await this.prisma.battle.findFirst({ where: { warId: war.id, regionId: region.id, status: "ACTIVE" } });
    if (activeBattle) throw new ConflictException("region already under attack");
    const bordering = await this.prisma.region.count({
      where: {
        countryId: actorCountryId,
        OR: [
          { neighborsA: { some: { bId: region.id } } },
          { neighborsB: { some: { aId: region.id } } },
        ],
      },
    });
    if (bordering === 0) {
      // King of the Hill: the hill borders nothing — any country may attack it during the event.
      const koth = await this.prisma.specialEvent.findFirst({ where: { type: "KOTH", status: "ACTIVE" }, select: { regionId: true } });
      if (!koth?.regionId || koth.regionId !== region.id) throw new BadRequestException("no border between attacker and the region");
    }
  }

  async createBattle(tx: Tx, war: { id: string; type: WarType; attackerCountryId: string | null; defenderCountryId: string }, region: { id: string }) {    const attackerCountryId = war.type === "CIVIL" ? war.defenderCountryId : war.attackerCountryId!;
    const buildings = await tx.regionBuilding.findMany({ where: { regionId: region.id } });
    const hospital = buildings.find((b) => b.type === "HOSPITAL");
    const ds = buildings.find((b) => b.type === "FORTIFICATION");
    const battle = await tx.battle.create({
      data: { warId: war.id, regionId: region.id, attackerCountryId, defenderCountryId: war.defenderCountryId },
    });
    await this.startRound(tx, battle.id, ds?.quality ?? 0, !!hospital, !!ds);
    return battle;
  }

  async startRound(tx: Tx, battleId: string, fortQ: number, hospitalExists: boolean, fortificationExists: boolean) {
    const battle = await tx.battle.findUniqueOrThrow({ where: { id: battleId }, include: { war: true } });
    const seconds = roundSeconds(battle.war);
    return tx.round.create({
      data: {
        battleId,
        number: 1,
        endsAt: new Date(Date.now() + seconds * 1000),
        defenderFortQ: fortQ,
        hospitalExists,
        fortificationExists,
      },
    });
  }

  // ===========================================================================
  // RESISTANCE & CIVIL WARS (citizen-initiated)
  // ===========================================================================

  async startResistanceWar(citizen: { id: string; level: number; locationRegionId: string; citizenshipCountryId: string }, regionId: string) {
    if (citizen.level < RW_MIN_LEVEL) throw new ForbiddenException(`level ${RW_MIN_LEVEL} required`);
    if (citizen.locationRegionId !== regionId) throw new BadRequestException("you must be located in the region");
    return this.redis.withLock(`rw:${citizen.id}`, 6000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const region = await tx.region.findUniqueOrThrow({
          where: { id: regionId },
          include: { country: true, coreCountry: true },
        });
        if (region.countryId === region.coreCountryId) throw new BadRequestException("region is not occupied");
        // 10-minute cooldown per occupied country; congressmen are exempt (wiki: Resistance War).
        const congressman = await tx.congressSeat.findFirst({ where: { citizenId: citizen.id, active: true }, select: { id: true } });
        if (!congressman) {
          const lastRw = await tx.war.findFirst({
            where: { type: "RESISTANCE", defenderCountryId: region.countryId, startedAt: { gt: new Date(Date.now() - RW_COOLDOWN_MINUTES * 60_000) } },
          });
          if (lastRw) throw new ConflictException(`another resistance war was raised recently — wait ${RW_COOLDOWN_MINUTES} minutes (congressmen are exempt)`);
        }
        await this.game.moveGold(tx, { type: "CITIZEN", id: citizen.id }, null, GOLD(RW_COST), "RW_START");
        const war = await tx.war.create({
          data: {
            type: "RESISTANCE",
            attackerCountryId: region.coreCountryId,
            defenderCountryId: region.countryId,
            rwInitiatorId: citizen.id,
          },
        });
        await this.createBattle(tx, war, region);
        return war;
      }),
    );
  }

  async startCivilWar(citizen: { id: string; level: number; citizenshipCountryId: string }) {
    if (citizen.level < CIVIL_MIN_LEVEL) throw new ForbiddenException(`level ${CIVIL_MIN_LEVEL} required`);
    const pop = await this.game.activePopulation(citizen.citizenshipCountryId);
    const cost = GOLD(CIVIL_BASE_COST + pop * 0.1);
    const recent = await this.prisma.war.findFirst({
      where: {
        type: "CIVIL",
        defenderCountryId: citizen.citizenshipCountryId,
        startedAt: { gt: new Date(Date.now() - CIVIL_COOLDOWN_DAYS * 86_400_000) },
      },
    });
    if (recent) throw new ConflictException("a rebellion happened recently in this country (7-day cooldown)");
    return this.redis.withLock(`gold:${citizen.id}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        await this.game.moveGold(tx, { type: "CITIZEN", id: citizen.id }, null, cost, "CIVIL_START");
        return tx.war.create({
          data: {
            type: "CIVIL",
            attackerCountryId: citizen.citizenshipCountryId, // rebels organize under own country
            defenderCountryId: citizen.citizenshipCountryId,
            civilPollStatus: "VOTING",
            civilPollEndsAt: new Date(Date.now() + CIVIL_POLL_HOURS * 3600_000),
            rwInitiatorId: citizen.id,
          },
        });
      }),
    );
  }

  async voteCivilPoll(citizenId: string, warId: string, yes: boolean) {
    return this.redis.withLock(`civil:${warId}`, 6000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const war = await tx.war.findUniqueOrThrow({ where: { id: warId } });
        if (war.type !== "CIVIL" || war.civilPollStatus !== "VOTING") throw new ConflictException("poll is not open");
        const voter = await tx.citizen.findUniqueOrThrow({ where: { id: citizenId } });
        if (voter.citizenshipCountryId !== war.defenderCountryId) throw new ForbiddenException("citizens of the country only");
        const existing = await tx.civilPollVote.findUnique({ where: { warId_citizenId: { warId, citizenId } } });
        if (existing) throw new ConflictException("already voted (votes cannot be undone)");
        await tx.civilPollVote.create({ data: { warId, citizenId, yes } });
        await tx.war.update({
          where: { id: warId },
          data: yes ? { civilPollYes: { increment: 1 } } : { civilPollNo: { increment: 1 } },
        });
        return { ok: true };
      }),
    );
  }

  /** Sweep job: evaluate expired civil polls (33.3% support → battle starts). */
  async evaluateCivilPolls() {
    const expired = await this.prisma.war.findMany({
      where: { type: "CIVIL", civilPollStatus: "VOTING", civilPollEndsAt: { lt: new Date() } },
    });
    for (const war of expired) {
      await this.redis.withLock(`civil:${war.id}`, 10000, () =>
        this.prisma.$transaction(async (tx: Tx) => {
          const fresh = await tx.war.findUniqueOrThrow({ where: { id: war.id } });
          if (fresh.civilPollStatus !== "VOTING") return;
          const total = fresh.civilPollYes + fresh.civilPollNo;
          const passed = total >= 10 && fresh.civilPollYes / total >= CIVIL_SUPPORT_RATIO;
          if (passed) {
            await tx.war.update({ where: { id: war.id }, data: { civilPollStatus: "PASSED" } });
            const region = await tx.region.findFirst({
              where: { countryId: fresh.defenderCountryId },
              orderBy: { population: "desc" },
            });
            if (region) await this.createBattle(tx, fresh, region);
          } else {
            await tx.war.update({ where: { id: war.id }, data: { civilPollStatus: "FAILED", status: "ENDED", endedAt: new Date() } });
          }
        }),
      );
    }
    return { evaluated: expired.length };
  }

  // ===========================================================================
  // ROUND RESOLUTION (sweep + explicit finalize)
  // ===========================================================================

  async resolveExpiredRounds() {
    const rounds = await this.prisma.round.findMany({
      where: { status: "ACTIVE", endsAt: { lt: new Date() } },
      include: { battle: true },
      take: 50,
    });
    for (const round of rounds) {
      await this.finalizeRound(round.id).catch(() => undefined);
    }
    return { finalized: rounds.length };
  }

  async finalizeRound(roundId: string) {
    return this.redis.withLock(`round:${roundId}`, 15000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const round = await tx.round.findUnique({ where: { id: roundId }, include: { battle: { include: { war: true } } } });
        if (!round || round.status !== "ACTIVE") return { skipped: true };
        const battle = round.battle;
        const war = battle.war;

        const a = Number(round.attackerDamage);
        const d = Number(round.defenderDamage);
        const winnerSide: BattleSide = a > d ? "ATTACKER" : "DEFENDER"; // ties favor the defender

        await tx.round.update({
          where: { id: roundId },
          data: { status: "ENDED", winnerSide },
        });

        // Battle hero: top damage per side this round.
        // Training Yard (wiki): practice awards no medals — Round Hero gold would
        // otherwise be farmable by solo-grinding the yard.
        const training = (battle.war.config as { training?: boolean } | null)?.training === true;
        if (!training) {
          const top = await tx.battleHit.groupBy({
            by: ["citizenId", "side"],
            where: { roundId, damage: { gt: 0 } },
            _sum: { damage: true },
          });
          for (const side of ["ATTACKER", "DEFENDER"] as BattleSide[]) {
            const best = top
              .filter((t) => t.side === side)
              .sort((x, y) => Number(y._sum.damage) - Number(x._sum.damage))[0];
            if (best) {
              await this.game.awardMedal(tx, best.citizenId, "BATTLE_HERO", BATTLE_HERO_GOLD, { roundId, side, damage: Number(best._sum.damage) });
            }
          }
        }

        // Destroy hospital/DS when defenders lose the round (wiki).
        if (winnerSide === "ATTACKER") {
          await tx.regionBuilding.deleteMany({ where: { regionId: battle.regionId } });
        }

        // War bookkeeping.
        const attackerWon = winnerSide === "ATTACKER";
        const warData = attackerWon
          ? { attackerWins: { increment: 1 } }
          : { defenderWins: { increment: 1 } };
        const updatedWar = await tx.war.update({ where: { id: war.id }, data: warData });
        const roundNumber = round.number;
        const decidedByRounds = updatedWar.attackerWins >= ROUNDS_TO_WIN || updatedWar.defenderWins >= ROUNDS_TO_WIN;
        const outOfRounds = roundNumber >= MAX_ROUNDS;
        const battleActive = !decidedByRounds && !outOfRounds;

        if (battleActive) {
          const ds = await tx.regionBuilding.findFirst({ where: { regionId: battle.regionId, type: "FORTIFICATION" } });
          const hospital = await tx.regionBuilding.findFirst({ where: { regionId: battle.regionId, type: "HOSPITAL" } });
          const fortBase = ds?.quality ?? 0;
          await tx.round.create({
            data: {
              battleId: battle.id,
              number: roundNumber + 1,
              endsAt: new Date(Date.now() + roundSeconds(war) * 1000),
              // Halloween dynamic walls: fortification quality grows +1 per round (capped Q5).
              defenderFortQ: (war.config as { halloween?: boolean } | null)?.halloween ? Math.min(5, round.defenderFortQ + 1) : fortBase,
              hospitalExists: !!hospital,
              fortificationExists: !!ds,
            },
          });
          await tx.battle.update({ where: { id: battle.id }, data: { roundNumber: { increment: 1 } } });
          return { roundWon: winnerSide };
        }

        // Battle & war over → full resolution. Winner country holds a 24h attack initiative (wiki).
        const battleWinnerSide: BattleSide =
          updatedWar.attackerWins === updatedWar.defenderWins
            ? winnerSide // last round decides ties (7-7 → round 15 winner)
            : updatedWar.attackerWins > updatedWar.defenderWins ? "ATTACKER" : "DEFENDER";
        const battleWinnerCountryId = battleWinnerSide === "ATTACKER" ? battle.attackerCountryId : battle.defenderCountryId;
        await tx.battle.update({ where: { id: battle.id }, data: { status: "ENDED", endedAt: new Date(), winnerCountryId: battleWinnerCountryId } });
        await tx.war.update({
          where: { id: war.id },
          data: {
            initiativeCountryId: battleWinnerCountryId,
            initiativeUntil: new Date(Date.now() + WAR_INITIATIVE_HOURS * 3_600_000),
          },
        });
        await this.endWar(tx, updatedWar, battleWinnerCountryId!, battle.id, battleWinnerSide === "ATTACKER");
        return { roundWon: winnerSide, warEnded: true };
      }),
    );
  }

  private async endWar(
    tx: Tx,
    war: War,
    winnerCountryId: string,
    battleId: string,
    attackerWon: boolean,
  ) {
    await tx.war.update({
      where: { id: war.id },
      data: { status: "ENDED", endedAt: new Date(), winnerCountryId },
    });

    // Training Yard (wiki): practice wars end with no region transfer, no medals
    // and no loot — the yard resets on the next visit.
    if ((war.config as { training?: boolean } | null)?.training === true) {
      return;
    }

    // Region transfer + conquest semantics.
    if (war.type === "DIRECT" && attackerWon) {
      const battle = await tx.battle.findUniqueOrThrow({ where: { id: battleId } });
      await tx.region.update({ where: { id: battle.regionId }, data: { countryId: winnerCountryId } });
      await tx.regionBuilding.deleteMany({ where: { regionId: battle.regionId } });
      // King of the Hill (wiki): capture pays gold and spawns an automatic resistance war
      // for the neutral core — the hill can be reclaimed without a new DoW.
      if ((war.config as { koth?: boolean } | null)?.koth === true) {
        const hill = await tx.region.findUniqueOrThrow({ where: { id: battle.regionId } });
        await this.game.treasuryMove(tx, winnerCountryId, GOLD(KOTH_REWARD_GOLD), "OTHER", { kind: "KOTH_REWARD", warId: war.id, regionId: hill.id });
        const rw = await tx.war.create({
          data: { type: "RESISTANCE", attackerCountryId: hill.coreCountryId, defenderCountryId: winnerCountryId, config: { kothRw: true } as never },
        });
        await this.createBattle(tx, rw, hill);
      }
    }
    if (war.type === "RESISTANCE" && attackerWon) {
      const battle = await tx.battle.findUniqueOrThrow({ where: { id: battleId } });
      await tx.region.update({ where: { id: battle.regionId }, data: { countryId: war.attackerCountryId! } });
      await tx.regionBuilding.deleteMany({ where: { regionId: battle.regionId } });
      if (war.rwInitiatorId) {
        await this.game.awardMedal(tx, war.rwInitiatorId, "RESISTANCE_HERO", RESISTANCE_HERO_GOLD, { warId: war.id });
      }
    }
    if (war.type === "CIVIL" && attackerWon && war.rwInitiatorId) {
      // Rebels win: initiator becomes president and the top 20 rebel fighters (excluding
      // the initiator) replace the whole congress (wiki: Civil War).
      await tx.country.update({ where: { id: war.defenderCountryId }, data: { presidentId: war.rwInitiatorId } });
      await tx.congressSeat.updateMany({ where: { countryId: war.defenderCountryId, active: true }, data: { active: false } });
      const rebelTop = await tx.battleHit.groupBy({
        by: ["citizenId"],
        where: { battleId, side: "ATTACKER", citizenId: { not: war.rwInitiatorId } },
        _sum: { damage: true },
        orderBy: { _sum: { damage: "desc" } },
      });
      for (let i = 0; i < rebelTop.length && i < CONGRESS_SEATS; i++) {
        await tx.congressSeat.create({
          data: { countryId: war.defenderCountryId, citizenId: rebelTop[i].citizenId, electedDay: await this.game.currentDay() },
        });
      }
    }

    // Campaign hero medals (top cumulative damage per side, whole war).
    const totals = await tx.battleHit.groupBy({
      by: ["citizenId", "side"],
      where: { battle: { warId: war.id } },
      _sum: { damage: true },
    });
    for (const side of ["ATTACKER", "DEFENDER"] as BattleSide[]) {
      const best = totals.filter((t) => t.side === side).sort((x, y) => Number(y._sum.damage) - Number(x._sum.damage))[0];
      if (best && Number(best._sum.damage) > 0) {
        await this.game.awardMedal(tx, best.citizenId, "CAMPAIGN_HERO", CAMPAIGN_HERO_GOLD, { warId: war.id, side, damage: Number(best._sum.damage) });
      }
    }

    // Equipment loot drops (wiki distribution).
    const hits = await tx.battleHit.count({ where: { battleId } });
    await this.distributeLoot(tx, battleId, hits).catch(() => undefined);

    // Conquered country? (0 regions left)
    const loserId = winnerCountryId === war.attackerCountryId ? war.defenderCountryId : war.attackerCountryId;
    if (loserId && (await tx.region.count({ where: { countryId: loserId } })) === 0) {
      await tx.country.update({ where: { id: loserId }, data: { active: false } });
      await tx.war.updateMany({
        where: { status: "ACTIVE", OR: [{ attackerCountryId: loserId }, { defenderCountryId: loserId }] },
        data: { status: "ENDED", endedAt: new Date(), winnerCountryId: loserId === war.attackerCountryId ? war.defenderCountryId : war.attackerCountryId! },
      });
    }
  }

  /**
   * Battle drops (wiki): everyone Q1 (300 hits), round top-10-per-side Q2 (1500),
   * round top-3-per-side Q3 (7500), round heroes Q4 (37500) + Upgrade item (2500).
   */
  private async distributeLoot(tx: Tx, battleId: string, hits: number) {
    const drops = battleDropCounts(hits);
    const participants = await tx.battleHit.groupBy({
      by: ["citizenId"],
      where: { battleId },
      _sum: { damage: true },
      orderBy: { _sum: { damage: "desc" } },
    });
    if (participants.length === 0) return;
    // Per-round pools: round hero, top-3 and top-10 per side per round.
    const rounds = await tx.round.findMany({ where: { battleId }, select: { id: true } });
    const roundHeroes = new Set<string>();
    const roundTop3 = new Set<string>();
    const roundTop10 = new Set<string>();
    for (const round of rounds) {
      const perSide = await tx.battleHit.groupBy({
        by: ["citizenId", "side"],
        where: { roundId: round.id, damage: { gt: 0 } },
        _sum: { damage: true },
      });
      for (const side of ["ATTACKER", "DEFENDER"] as BattleSide[]) {
        const ranked = perSide
          .filter((t) => t.side === side)
          .sort((x, y) => Number(y._sum.damage) - Number(x._sum.damage));
        if (ranked[0]) roundHeroes.add(ranked[0].citizenId);
        ranked.slice(0, 3).forEach((t) => roundTop3.add(t.citizenId));
        ranked.slice(0, 10).forEach((t) => roundTop10.add(t.citizenId));
      }
    }
    const everyone = participants.map((p) => p.citizenId);

    const pool: Array<{ q: number; candidates: string[] }> = [
      { q: 4, candidates: everyone.filter((c) => roundHeroes.has(c)) },
      { q: 3, candidates: everyone.filter((c) => roundTop3.has(c)) },
      { q: 2, candidates: everyone.filter((c) => roundTop10.has(c)) },
      { q: 1, candidates: everyone },
    ];
    for (const { q, candidates } of pool) {
      const count = drops[q] ?? 0;
      for (let i = 0; i < count && candidates.length > 0; i++) {
        const winner = candidates[Math.floor(Math.random() * candidates.length)];
        await this.equipment.grantDrop(tx, winner, q);
      }
    }
    // Upgrade special item once 2500 hits are reached — round heroes only (wiki).
    if (hits >= UPGRADE_ITEM_DROP_HITS && roundHeroes.size > 0) {
      const heroes = [...roundHeroes];
      await this.equipment.grantSpecial(tx, heroes[Math.floor(Math.random() * heroes.length)], "UPGRADE");
    }
  }

  // ---------------------------------------------------------------------------
  // Training Yard (wiki): dedicated practice battlefield, Team Alpha vs Team Beta.
  // Two hidden system countries + a `config.training` war stamp (like KotH).
  // Anyone may fight from anywhere; 1-hour rounds; first to 8 round-wins.
  // ---------------------------------------------------------------------------
  private static readonly TRAINING_TEAMS = [
    { name: "Team Alpha", code: "TMA", x: 200_000, y: 200_000 },
    { name: "Team Beta", code: "TMB", x: 202_000, y: 200_000 },
  ] as const;

  /** The active training battle (or the freshly opened one). No cost, no DoW. */
  async trainingYard() {
    const existing = await this.prisma.war.findFirst({
      where: { status: "ACTIVE", config: { path: ["training"], equals: true } },
      include: { battles: { where: { status: "ACTIVE" }, include: { rounds: { where: { status: "ACTIVE" }, orderBy: { number: "desc" }, take: 1 } } } },
    });
    if (existing && existing.battles.length > 0) {
      return { war: existing, battle: existing.battles[0] };
    }
    return this.prisma.$transaction(async (tx: Tx) => {
      const ids: string[] = [];
      for (const team of WarsService.TRAINING_TEAMS) {
        let country = await tx.country.findUnique({ where: { code: team.code } });
        if (!country) {
          country = await tx.country.create({
            data: { name: team.name, code: team.code, type: "STAFF", active: false, currencyName: "Gold", currencySymbol: "g" },
          });
        }
        const hasRegion = await tx.region.count({ where: { countryId: country.id } });
        if (hasRegion === 0) {
          await tx.region.create({
            data: { name: `${team.name} Yard`, countryId: country.id, coreCountryId: country.id, kind: "NON_RAW", isCapital: true, x: team.x, y: team.y },
          });
        }
        ids.push(country.id);
      }
      // Beta attacks Alpha's yard region (region belongs to the war defender).
      const alphaRegion = await tx.region.findFirstOrThrow({ where: { countryId: ids[0] } });
      const war = await tx.war.create({
        data: { type: "DIRECT", attackerCountryId: ids[1], defenderCountryId: ids[0], config: { training: true, roundSeconds: TRAINING_ROUND_SECONDS } as never },
      });
      const battle = await this.createBattle(tx, war, alphaRegion);
      return { war, battle };
    });
  }

  // ---------------------------------------------------------------------------
  // Fight eligibility (participation + location bonus)
  // ---------------------------------------------------------------------------

  async canFight(
    citizen: { id: string; level: number; citizenshipCountryId: string; locationRegionId: string },
    battle: { id: string; warId: string; regionId: string; attackerCountryId: string; defenderCountryId: string; war: { id: string; type: WarType; attackerCountryId: string | null; defenderCountryId: string; config: unknown } },
    side: BattleSide,
  ): Promise<{ ok: boolean; bonusPct: number; reason?: string }> {
    if (citizen.level < 2) return { ok: false, bonusPct: 0, reason: "level 2 required to fight" };

    const warType = battle.war.type;
    const inRegion = citizen.locationRegionId === battle.regionId;

    if (warType === "CIVIL") {
      if (citizen.citizenshipCountryId !== battle.war.defenderCountryId) {
        return { ok: false, bonusPct: 0, reason: "only citizens of the country can fight in a civil war" };
      }
      // Voters may fight only for the side they voted for; non-voters cannot fight (wiki: Civil War).
      const vote = await this.prisma.civilPollVote.findUnique({
        where: { warId_citizenId: { warId: battle.war.id, citizenId: citizen.id } },
      });
      if (!vote) {
        return { ok: false, bonusPct: 0, reason: "you did not vote in the civil war unrest" };
      }
      const rebelSide = side === "ATTACKER"; // rebels organize under the ATTACKER side
      if (vote.yes !== rebelSide) {
        return { ok: false, bonusPct: 0, reason: "you can fight only for the side you voted for in the unrest" };
      }
      return { ok: true, bonusPct: 0 };
    }

    if (warType === "RESISTANCE") {
      // Defenders (occupant) may be citizens of the occupant country; attackers are
      // the rightful owner's citizens. Region presence grants the bonus to both sides.
      const ownSide = side === "ATTACKER" ? battle.war.attackerCountryId : battle.war.defenderCountryId;
      if (citizen.citizenshipCountryId !== ownSide) {
        return { ok: false, bonusPct: 0, reason: "only involved countries can fight a resistance war" };
      }
      return { ok: true, bonusPct: inRegion ? 0.2 : 0 };
    }

    // DIRECT war: involved countries fight from anywhere; MPP allies too.
    const involved =
      citizen.citizenshipCountryId === battle.attackerCountryId ||
      citizen.citizenshipCountryId === battle.defenderCountryId;
    // Patriot Week (wiki): strict citizenship fight lock — homeland fights only.
    // The Training Yard stays open during events (practice never stops).
    const isTraining = (battle.war.config as { training?: boolean } | null)?.training === true;
    if (!involved && !isTraining) {
      const patriot = await this.prisma.specialEvent.findFirst({ where: { type: "PATRIOT_WEEK", status: "ACTIVE" }, select: { id: true } });
      if (patriot) return { ok: false, bonusPct: 0, reason: "Patriot Week: citizens may fight only for their homeland" };
    }
    // King of the Hill: any citizen may join the hill fight (server-wide event).
    const koth = (battle.war.config as { koth?: boolean } | null)?.koth === true;
    const mpp = involved
      ? true
      : (await this.prisma.treaty.count({
          where: {
            type: "MPP",
            active: true,
            OR: [
              { countryAId: citizen.citizenshipCountryId, countryBId: side === "ATTACKER" ? battle.attackerCountryId : battle.defenderCountryId },
              { countryBId: citizen.citizenshipCountryId, countryAId: side === "ATTACKER" ? battle.attackerCountryId : battle.defenderCountryId },
            ],
          },
        })) > 0;
    if (!involved && !mpp && !koth && !isTraining) {
      return { ok: false, bonusPct: 0, reason: "your country is not involved and holds no MPP — travel to the battle region" };
    }

    // Location bonus: defender on the region, attacker on a bordering own-country region.
    let bonus = 0;
    if (side === "DEFENDER" && inRegion) bonus = 0.2;
    if (side === "ATTACKER") {
      if (inRegion) bonus = 0;
      else {
        const bordering = await this.prisma.region.findFirst({
          where: {
            id: citizen.locationRegionId,
            countryId: battle.attackerCountryId,
            OR: [{ neighborsA: { some: { bId: battle.regionId } } }, { neighborsB: { some: { aId: battle.regionId } } }],
          },
        });
        bonus = bordering ? 0.2 : 0;
      }
    }
    return { ok: true, bonusPct: bonus };
  }
}
