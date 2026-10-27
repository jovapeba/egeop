import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService, type Tx } from "../prisma/prisma.service";
import { GameService } from "../game/game.service";
import { HALLOWEEN_ROUND_SECONDS, KOTH_REWARD_GOLD } from "@egeopolis/game-core";

const GOLD = (g: number) => BigInt(Math.round(g * 100));

export type SpecialEventType = "HALLOWEEN" | "KOTH" | "PATRIOT_WEEK";

/**
 * Special events (wiki Category 7):
 * - HALLOWEEN — Earth vs Halloween Army: system country invades a staff-chosen region,
 *   2-hour rounds, walls fortify +1 quality per round (dynamic walls).
 * - KOTH — King of the Hill: a special neutral region anyone may DoW during the event
 *   (no border requirement); capturing pays gold and spawns an automatic resistance war.
 * - PATRIOT_WEEK — strict citizenship fight lock: only homeland fights allowed.
 */
@Injectable()
export class SpecialEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService,
  ) {}

  adminCreate(body: {
    type: SpecialEventType;
    startsInMinutes?: number;
    durationHours?: number;
    defenderCountryId?: string;
    regionId?: string;
  }) {
    if (!["HALLOWEEN", "KOTH", "PATRIOT_WEEK"].includes(body.type)) throw new BadRequestException("unknown event type");
    const startsAt = new Date(Date.now() + (body.startsInMinutes ?? 0) * 60_000);
    const endsAt = new Date(startsAt.getTime() + (body.durationHours ?? 24 * 7) * 3_600_000);
    return this.prisma.$transaction(async (tx) => {
      const config: Record<string, unknown> = {};
      let regionId: string | null = null;

      if (body.type === "KOTH") {
        const hill = await this.ensureHill(tx);
        regionId = hill.id;
        config.countryId = hill.countryId;
      }
      if (body.type === "HALLOWEEN") {
        const army = await this.ensureHalloweenArmy(tx);
        if (!body.defenderCountryId || !body.regionId) throw new BadRequestException("halloween needs defenderCountryId and regionId");
        config.defenderCountryId = body.defenderCountryId;
        config.regionId = body.regionId;
        config.attackerCountryId = army.id;
      }
      return tx.specialEvent.create({
        data: { type: body.type, startsAt, endsAt, config: config as never, regionId },
      });
    });
  }

  list() {
    return this.prisma.specialEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  }

  /** Currently ACTIVE event of the given type (null when none). */
  activeEvent(type: SpecialEventType) {
    return this.prisma.specialEvent.findFirst({ where: { type, status: "ACTIVE" } });
  }

  /** Activate scheduled events, expire finished ones. Called from the 60s sweep. */
  async tick() {
    const now = new Date();
    let activated = 0;
    let ended = 0;

    const due = await this.prisma.specialEvent.findMany({ where: { status: "SCHEDULED", startsAt: { lte: now } } });
    for (const ev of due) {
      await this.prisma.$transaction(async (tx) => {
        const still = await tx.specialEvent.findFirst({ where: { id: ev.id, status: "SCHEDULED" } });
        if (!still) return;
        if (ev.type === "HALLOWEEN") await this.startHalloweenWar(tx, ev.id, ev.config as Record<string, string>);
        await tx.specialEvent.update({ where: { id: ev.id }, data: { status: "ACTIVE" } });
        activated++;
      });
    }

    const expired = await this.prisma.specialEvent.findMany({ where: { status: "ACTIVE", endsAt: { lte: now } } });
    for (const ev of expired) {
      await this.prisma.$transaction(async (tx) => {
        if (ev.warId) {
          await tx.war.updateMany({ where: { id: ev.warId, status: "ACTIVE" }, data: { status: "ENDED", endedAt: now } });
        }
        await tx.specialEvent.update({ where: { id: ev.id }, data: { status: "ENDED" } });
        ended++;
      });
    }
    return { activated, ended };
  }

  /** Halloween: create the invasion war (system country attacks the chosen region) + first battle. */
  private async startHalloweenWar(tx: Tx, eventId: string, cfg: Record<string, string>) {
    const region = await tx.region.findUnique({ where: { id: cfg.regionId } });
    if (!region) throw new NotFoundException("halloween target region not found");
    const war = await tx.war.create({
      data: {
        type: "DIRECT",
        attackerCountryId: cfg.attackerCountryId,
        defenderCountryId: cfg.defenderCountryId,
        config: { halloween: true, roundSeconds: HALLOWEEN_ROUND_SECONDS } as never,
      },
    });
    const hospital = await tx.regionBuilding.findFirst({ where: { regionId: region.id, type: "HOSPITAL" } });
    const fort = await tx.regionBuilding.findFirst({ where: { regionId: region.id, type: "FORTIFICATION" } });
    const battle = await tx.battle.create({
      data: { warId: war.id, regionId: region.id, attackerCountryId: cfg.attackerCountryId, defenderCountryId: cfg.defenderCountryId },
    });
    await tx.round.create({
      data: {
        battleId: battle.id,
        number: 1,
        endsAt: new Date(Date.now() + HALLOWEEN_ROUND_SECONDS * 1000),
        defenderFortQ: fort?.quality ?? 0,
        hospitalExists: !!hospital,
        fortificationExists: !!fort,
      },
    });
    await tx.battle.update({ where: { id: battle.id }, data: { roundNumber: 1 } });
    await tx.specialEvent.update({ where: { id: eventId }, data: { warId: war.id } });
    return war;
  }

  /** Seed (once) the King of the Hill: a neutral system country owning one special region. */
  private async ensureHill(tx: Tx) {
    const existing = await tx.region.findFirst({ where: { name: "King of the Hill" } });
    if (existing) return existing;
    let country = await tx.country.findUnique({ where: { code: "HILL" } });
    if (!country) {
      country = await tx.country.create({
        data: {
          name: "King of the Hill",
          code: "HILL",
          type: "NEUTRAL",
          active: false,
          currencyName: "Gold",
          currencySymbol: "g",
        },
      });
    }
    return tx.region.create({
      data: {
        name: "King of the Hill",
        countryId: country.id,
        coreCountryId: country.id,
        kind: "NON_RAW",
        x: 0,
        y: 0,
        population: 1000,
      },
    });
  }

  /** Seed (once) the Halloween Army system country (no regions — it fights as war attacker). */
  private async ensureHalloweenArmy(tx: Tx) {
    const existing = await tx.country.findUnique({ where: { code: "HAL" } });
    if (existing) return existing;
    return tx.country.create({
      data: {
        name: "Halloween Army",
        code: "HAL",
        type: "NEUTRAL",
        active: false,
        currencyName: "Souls",
        currencySymbol: "☾",
      },
    });
  }

  /** KOTH capture payout (called from WarsService.endWar inside its transaction). */
  async payHillReward(tx: Tx, warId: string, capturerCountryId: string, regionId: string) {
    await this.game.treasuryMove(tx, capturerCountryId, GOLD(KOTH_REWARD_GOLD), "OTHER", { kind: "KOTH_REWARD", warId, regionId });
  }
}
