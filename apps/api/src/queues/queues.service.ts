import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Queue, Worker, type JobsOptions } from "bullmq";
import { PrismaService, type Tx } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { WarsService } from "../wars/wars.service";
import { AuctionsService } from "../auctions/auctions.service";
import { EventsService } from "../events/events.service";
import { SpecialEventsService } from "../events/special-events.service";
import { StocksService } from "../stocks/stocks.service";
import { PoliticsService } from "../politics/politics.service";
import { EquipmentService } from "../equipment/equipment.service";
import { GameService } from "../game/game.service";
import {
  HP_DAY_CHANGE_BONUS, HP_MAX, HP_REGEN_PER_HOUR,
  MONTH_DAYS, MONTHLY_ARMY_GOLD, MONTHLY_COUNTRY_GOLD,
  YEAR_DAYS, YEARLY_ARMY_GOLD, YEARLY_COUNTRY_GOLD, YEARLY_CITIZEN_GOLD, YEARLY_REGION_GOLD,
} from "@egeopolis/game-core";

export const QUEUE_NAME = "egeopolis";

type JobName = "hp-regen" | "day-change" | "battle-sweep" | "elections-tick";

const REPEATS: Record<JobName, { every: number }> = {
  "hp-regen": { every: 3600_000 }, // +100 HP/hour +1 food +1 ED limit
  "day-change": { every: 60_000 }, // detect server midnight rollover
  "battle-sweep": { every: 60_000 }, // expired rounds, civil polls, expired laws
  "elections-tick": { every: 1800_000 }, // election phase transitions
};

@Injectable()
export class QueuesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueuesService.name);
  private queue!: Queue;
  private workers: Worker[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly wars: WarsService,
    private readonly politics: PoliticsService,
    private readonly auctions: AuctionsService,
    private readonly events: EventsService,
    private readonly stocks: StocksService,
    private readonly special: SpecialEventsService,
    private readonly equipment: EquipmentService,
    private readonly game: GameService,
  ) {}

  async onModuleInit() {
    const connection = { url: process.env.REDIS_URL || "redis://localhost:6379" };
    this.queue = new Queue(QUEUE_NAME, { connection });
    for (const [name, repeat] of Object.entries(REPEATS) as Array<[JobName, { every: number }]>) {
      await this.queue.add(name, {}, { repeat, jobId: `repeat:${name}`, removeOnComplete: 50, removeOnFail: 50 } as JobsOptions);
    }
    this.logger.log("repeatable jobs registered");

    this.workers = [
      new Worker(QUEUE_NAME, (job) => this.dispatch(job.name as JobName), {
        connection,
        concurrency: 2,
      }),
    ];
    for (const w of this.workers) {
      w.on("failed", (job, err) => this.logger.error(`${job?.name} failed: ${err.message}`));
    }
  }

  private async dispatch(name: JobName): Promise<unknown> {
    switch (name) {
      case "hp-regen":
        return this.regenHealth();
      case "day-change":
        return this.dayChange();
      case "battle-sweep":
        return this.sweep();
      case "elections-tick":
        return this.politics.electionTick();
    }
  }

  /** Hourly cron (v2): +100 HP, +1 food limit, +1 energy drink limit — bulk SQL, idempotent. */
  private async regenHealth() {
    const rows = await this.prisma.$executeRawUnsafe(`
      UPDATE "Citizen"
      SET hp = LEAST(${HP_MAX}, hp + ${HP_REGEN_PER_HOUR} * FLOOR(EXTRACT(EPOCH FROM (now() - "lastRegenAt")) / 3600)::int),
          "foodLimitExtra" = "foodLimitExtra" + 1,
          "giftLimitExtra" = "giftLimitExtra" + 1,
          "lastRegenAt" = "lastRegenAt" + (FLOOR(EXTRACT(EPOCH FROM (now() - "lastRegenAt")) / 3600) * INTERVAL '1 hour')
      WHERE "lastRegenAt" < now() - INTERVAL '1 hour'
    `);
    return { updated: rows };
  }

  /** Server midnight reset: +50 HP bonus (wiki), reset daily limits. */
  private async dayChange() {
    return this.redis.withLock("day-change", 50_000, async () => {
      const day = await this.gameDay();
      const clock = await this.prisma.gameClock.findUnique({ where: { id: 1 } });
      if (!clock) return { skipped: true };
      const currentDay = await this.dayNumber(clock.serverStart);
      if ((clock.lastDayDone ?? 0) >= currentDay) return { skipped: true, currentDay };

      await this.prisma.$transaction(async (tx) => {
        await tx.gameClock.update({ where: { id: 1 }, data: { lastDayDone: currentDay } });
        await tx.$executeRawUnsafe(`
          UPDATE "Citizen"
          SET hp = LEAST(${HP_MAX}, hp + ${HP_DAY_CHANGE_BONUS}),
              "foodUsed" = 0,
              "giftUsed" = 0,
              "foodLimitExtra" = 0,
              "giftLimitExtra" = 0,
              "hospitalUsedOnDay" = 0,
              "freeFlightsToday" = 0,
              "pantryDaysLeft" = GREATEST(0, "pantryDaysLeft" - 1),
              "fridgeDaysLeft" = GREATEST(0, "fridgeDaysLeft" - 1)
        `);
      });
      // Election transitions run right after the reset.
      const elections = await this.politics.electionTick();
      // Monthly & yearly reward cycles run on their anniversary boundaries.
      const monthly = await this.monthlyTick(currentDay).catch((e) => ({ error: e.message }));
      const yearly = await this.yearlyTick(currentDay).catch((e) => ({ error: e.message }));
      this.logger.log(`day ${currentDay} processed`);
      return { day: currentDay, elections, monthly, yearly };
    });
  }

  /**
   * Monthly rewards (wiki): top-5 damage countries & armies over the finished 30-day
   * period — country treasury / army vault gold. Damage comes from StatsRollup.
   */
  private async monthlyTick(day: number) {
    const monthIndex = Math.floor((day - 1) / MONTH_DAYS);
    const clock = await this.prisma.gameClock.findUnique({ where: { id: 1 } });
    if (!clock || clock.lastMonthlyDone >= monthIndex) return { skipped: true, monthIndex };

    const dayTo = monthIndex * MONTH_DAYS; // finished period: [dayTo-29, dayTo]
    const dayFrom = dayTo - MONTH_DAYS + 1;

    const countryRows = await this.prisma.statsRollup.groupBy({
      by: ["ownerId"],
      where: { ownerType: "COUNTRY", day: { gte: dayFrom, lte: dayTo } },
      _sum: { damage: true },
      orderBy: { _sum: { damage: "desc" } },
      take: MONTHLY_COUNTRY_GOLD.length,
    });
    const countryGold = await this.payCountryRewards(countryRows, MONTHLY_COUNTRY_GOLD, "MONTHLY_COUNTRY");

    // Army damage = sum of its members' citizen damage (membership is 1:1 with citizens).
    const memberDamage = await this.prisma.statsRollup.groupBy({
      by: ["ownerId"],
      where: { ownerType: "CITIZEN", day: { gte: dayFrom, lte: dayTo } },
      _sum: { damage: true },
      orderBy: { _sum: { damage: "desc" } },
      take: 500,
    });
    const memberships = await this.prisma.muMembership.findMany({
      where: { citizenId: { in: memberDamage.map((r) => r.ownerId) } },
      select: { muId: true, citizenId: true },
    });
    const byMu = new Map<string, bigint>();
    const muOf = new Map(memberships.map((m) => [m.citizenId, m.muId]));
    for (const r of memberDamage) {
      const muId = muOf.get(r.ownerId);
      if (!muId) continue;
      byMu.set(muId, (byMu.get(muId) ?? 0n) + (r._sum.damage ?? 0n));
    }
    const armyRows = [...byMu.entries()]
      .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
      .slice(0, MONTHLY_ARMY_GOLD.length)
      .map(([muId, damage]) => ({ ownerId: muId, damage }));
    const armyGold = await this.payArmyRewards(armyRows, MONTHLY_ARMY_GOLD, "MONTHLY_ARMY");

    await this.prisma.gameClock.update({ where: { id: 1 }, data: { lastMonthlyDone: monthIndex } });
    return { monthIndex, dayFrom, dayTo, countryGold, armyGold };
  }

  /**
   * Yearly cycle (wiki): leaderboard rewards for players / armies / countries / region
   * counts, paid BEFORE the annual FAK reset & attachment decay — the ranking reflects
   * the full finished year.
   */
  private async yearlyTick(day: number) {
    const yearIndex = Math.floor((day - 1) / YEAR_DAYS);
    const clock = await this.prisma.gameClock.findUnique({ where: { id: 1 } });
    if (!clock || clock.lastYearlyDone >= yearIndex) return { skipped: true, yearIndex };

    const dayTo = (yearIndex + 1) * YEAR_DAYS;

    const topCitizens = await this.prisma.statsRollup.groupBy({
      by: ["ownerId"],
      where: { ownerType: "CITIZEN", day: { lte: dayTo } },
      _sum: { damage: true },
      orderBy: { _sum: { damage: "desc" } },
      take: YEARLY_CITIZEN_GOLD.length,
    });
    const citizenGold = await this.payCitizenRewards(topCitizens, YEARLY_CITIZEN_GOLD, "YEARLY_CITIZEN");

    const countryRows = await this.prisma.statsRollup.groupBy({
      by: ["ownerId"],
      where: { ownerType: "COUNTRY", day: { lte: dayTo } },
      _sum: { damage: true },
      orderBy: { _sum: { damage: "desc" } },
      take: Math.max(YEARLY_COUNTRY_GOLD.length, YEARLY_REGION_GOLD.length),
    });
    const countryGold = await this.payCountryRewards(countryRows.slice(0, YEARLY_COUNTRY_GOLD.length), YEARLY_COUNTRY_GOLD, "YEARLY_COUNTRY");

    // Region counts: most territory held at the reset.
    const regionRows = await this.prisma.region.groupBy({
      by: ["countryId"],
      _count: { _all: true },
      orderBy: { _count: { countryId: "desc" } },
      take: YEARLY_REGION_GOLD.length,
    });
    const regionGold = await this.payCountryRewards(regionRows.map((r) => ({ ownerId: r.countryId })), YEARLY_REGION_GOLD, "YEARLY_REGION");

    const memberDamage = await this.prisma.statsRollup.groupBy({
      by: ["ownerId"],
      where: { ownerType: "CITIZEN", day: { lte: dayTo } },
      _sum: { damage: true },
      orderBy: { _sum: { damage: "desc" } },
      take: 500,
    });
    const memberships = await this.prisma.muMembership.findMany({
      where: { citizenId: { in: memberDamage.map((r) => r.ownerId) } },
      select: { muId: true, citizenId: true },
    });
    const byMu = new Map<string, bigint>();
    const muOf = new Map(memberships.map((m) => [m.citizenId, m.muId]));
    for (const r of memberDamage) {
      const muId = muOf.get(r.ownerId);
      if (!muId) continue;
      byMu.set(muId, (byMu.get(muId) ?? 0n) + (r._sum.damage ?? 0n));
    }
    const armyRows = [...byMu.entries()]
      .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
      .slice(0, YEARLY_ARMY_GOLD.length)
      .map(([muId, damage]) => ({ ownerId: muId, damage }));
    const armyGold = await this.payArmyRewards(armyRows, YEARLY_ARMY_GOLD, "YEARLY_ARMY");

    // Annual reset AFTER rewards (wiki): FAKs to zero + Q5 attachment decay.
    await this.prisma.citizen.updateMany({ data: { firstAidKits: 0 } });
    const decay = await this.equipment.applyAnnualDecay().catch((e) => ({ error: e.message }));

    await this.prisma.gameClock.update({ where: { id: 1 }, data: { lastYearlyDone: yearIndex } });
    return { yearIndex, citizenGold, countryGold, regionGold, armyGold, decay };
  }

  /** Credit country treasuries in placement order; notifies the president. */
  private async payCountryRewards(rows: Array<{ ownerId: string }>, ladder: number[], kind: string) {
    let paid = 0;
    for (let i = 0; i < rows.length; i++) {
      const country = await this.prisma.country.findUnique({ where: { id: rows[i].ownerId }, select: { id: true, type: true, active: true, presidentId: true } });
      if (!country || country.type === "STAFF") continue;
      await this.prisma.$transaction(async (tx) => {
        await tx.country.update({ where: { id: country.id }, data: { treasuryGold: { increment: BigInt(Math.round(ladder[i] * 100)) } } });
        await tx.transaction.create({
          data: { asset: "GOLD", reason: "OTHER", amount: BigInt(Math.round(ladder[i] * 100)), toType: "COUNTRY", toId: country.id, meta: { kind, place: i + 1 } },
        });
        if (country.presidentId) await this.game.notify(tx, country.presidentId, kind, { place: i + 1, gold: ladder[i] });
      });
      paid++;
    }
    return paid;
  }

  /** Credit army vaults in placement order; notifies the commander. */
  private async payArmyRewards(rows: Array<{ ownerId: string }>, ladder: number[], kind: string) {
    let paid = 0;
    for (let i = 0; i < rows.length; i++) {
      const mu = await this.prisma.militaryUnit.findUnique({ where: { id: rows[i].ownerId }, select: { id: true, leaderId: true } });
      if (!mu) continue;
      await this.prisma.$transaction(async (tx) => {
        await tx.militaryUnit.update({ where: { id: mu.id }, data: { gold: { increment: BigInt(Math.round(ladder[i] * 100)) } } });
        await tx.transaction.create({
          data: { asset: "GOLD", reason: "OTHER", amount: BigInt(Math.round(ladder[i] * 100)), toType: "MILITARY_UNIT", toId: mu.id, meta: { kind, place: i + 1 } },
        });
        if (mu.leaderId) await this.game.notify(tx, mu.leaderId, kind, { place: i + 1, gold: ladder[i] });
      });
      paid++;
    }
    return paid;
  }

  /** Credit top citizens; track the EVENTS "FAK reset placement" achievement (wiki). */
  private async payCitizenRewards(rows: Array<{ ownerId: string }>, ladder: number[], kind: string) {
    let paid = 0;
    for (let i = 0; i < rows.length; i++) {
      const exists = await this.prisma.citizen.findUnique({ where: { id: rows[i].ownerId }, select: { id: true } });
      if (!exists) continue;
      await this.prisma.$transaction(async (tx) => {
        await tx.citizen.update({ where: { id: exists.id }, data: { gold: { increment: BigInt(Math.round(ladder[i] * 100)) } } });
        await tx.transaction.create({
          data: { asset: "GOLD", reason: "OTHER", amount: BigInt(Math.round(ladder[i] * 100)), toType: "CITIZEN", toId: exists.id, meta: { kind, place: i + 1 } },
        });
        await this.game.trackAchievement(tx, exists.id, "EVENTS", "FAK_RESET_TOP", 1, 1);
        await this.game.notify(tx, exists.id, kind, { place: i + 1, gold: ladder[i] });
      });
      paid++;
    }
    return paid;
  }

  private gameDay() {
    return this.prisma.gameClock.findUniqueOrThrow({ where: { id: 1 } }).then((c) => c.lastDayDone);
  }

  /** Battle rounds + civil polls + expired law voting + auction settlement + tournament progression. */
  private async sweep() {
    const rounds = await this.wars.resolveExpiredRounds();
    const polls = await this.wars.evaluateCivilPolls();
    const laws = await this.politics.sweepExpiredLaws();
    const settled = await this.auctions.settleFinished().catch((e) => ({ error: e.message }));
    const tournaments = await this.events.tick().catch((e) => ({ error: e.message }));
    const jscPollSettled = await this.stocks.sweepPolls().catch((e) => ({ error: e.message }));
    const jscLiquidated = await this.stocks.liquidateInactive().catch((e) => ({ error: e.message }));
    const specialEvents = await this.special.tick().catch((e) => ({ error: e.message }));
    return { rounds, civilPolls: polls, laws, settled, tournaments, jscPolls: jscPollSettled, jscLiquidation: jscLiquidated, specialEvents };
  }

  async dayNumber(serverStart: Date): Promise<number> {
    return Math.floor((Date.now() - serverStart.getTime()) / 86_400_000) + 1;
  }

  async onModuleDestroy() {
    for (const w of this.workers) await w.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
  }
}
