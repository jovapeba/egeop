import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post } from "@nestjs/common";
import { FightService } from "./fight.service";
import { WarsService } from "./wars.service";
import { CurrentCitizen } from "../common/current-citizen.decorator";
import { PrismaService } from "../prisma/prisma.service";

@Controller("wars")
export class WarsController {
  constructor(
    private readonly wars: WarsService,
    private readonly fight: FightService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  list() {
    return this.wars.listWars("ACTIVE");
  }

  /** Training Yard (wiki): the active practice battle (Team Alpha vs Team Beta). */
  @Get("training")
  training() {
    return this.wars.trainingYard();
  }

  @Get("battles/:id")
  battle(@Param("id") id: string) {
    return this.wars.battleDetail(id);
  }

  @Get(":id")
  war(@Param("id") id: string) {
    return this.wars.warDetail(id);
  }

  /** President (or vCP) proposes a Declaration of War → law with 48h congress vote. */
  @Post("declare")
  async declare(
    @CurrentCitizen() citizen: { id: string; citizenshipCountryId: string },
    @Body() body: { defenderCountryId: string },
  ) {
    await this.assertWarProposer(citizen, "only the president (or the vCP) can declare war");
    return this.prisma.law.create({
      data: {
        countryId: citizen.citizenshipCountryId,
        type: "DECLARE_WAR",
        payload: { defenderCountryId: body.defenderCountryId },
        proposedById: citizen.id,
        votingEndsAt: new Date(Date.now() + 48 * 3600_000),
      },
    });
  }

  /** President (or vCP) proposes attacking a region → law with 48h congress vote. */
  @Post("attack")
  async attack(
    @CurrentCitizen() citizen: { id: string; citizenshipCountryId: string },
    @Body() body: { warId: string; regionId: string },
  ) {
    await this.assertWarProposer(citizen, "only the president (or the vCP) can attack regions");
    return this.prisma.law.create({
      data: {
        countryId: citizen.citizenshipCountryId,
        type: "ATTACK_REGION",
        payload: { warId: body.warId, regionId: body.regionId },
        proposedById: citizen.id,
        votingEndsAt: new Date(Date.now() + 48 * 3600_000),
      },
    });
  }

  /** War laws are proposed by the president or the vice country president (wiki: vCP). */
  private async assertWarProposer(citizen: { id: string; citizenshipCountryId: string }, message: string) {
    const country = await this.prisma.country.findUniqueOrThrow({ where: { id: citizen.citizenshipCountryId } });
    if (country.presidentId === citizen.id) return;
    const vice = await this.prisma.minister.findFirst({
      where: { countryId: citizen.citizenshipCountryId, citizenId: citizen.id, role: "VICE_PRESIDENT" },
      select: { citizenId: true },
    });
    if (!vice) throw new ForbiddenException(message);
  }

  /** Citizen-initiated resistance war (20g, level 10, located in the region). */
  @Post("resistance")
  resistance(
    @CurrentCitizen() citizen: { id: string; level: number; locationRegionId: string; citizenshipCountryId: string },
    @Body() body: { regionId: string },
  ) {
    return this.wars.startResistanceWar(citizen, body.regionId);
  }

  /** Citizen-initiated civil war poll (100g + 10% pop). */
  @Post("civil")
  civil(@CurrentCitizen() citizen: { id: string; level: number; citizenshipCountryId: string }) {
    return this.wars.startCivilWar(citizen);
  }

  @Post("civil/:id/vote")
  civilVote(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string, @Body() body: { yes: boolean }) {
    return this.wars.voteCivilPoll(citizen.id, id, body.yes);
  }

  /** Dev/testing helper: force-finalize expired rounds & civil polls now (admins only). */
  @Post("dev-sweep")
  async devSweep(@CurrentCitizen() citizen: { isAdmin: boolean }) {
    if (!citizen.isAdmin) throw new ForbiddenException("admins only");
    const rounds = await this.wars.resolveExpiredRounds();
    const polls = await this.wars.evaluateCivilPolls();
    return { rounds, polls };
  }

  @Post("battles/:id/fight")
  hit(
    @CurrentCitizen() citizen: { id: string; level: number; strength: number; citizenshipCountryId: string; locationRegionId: string; hp: number },
    @Param("id") battleId: string,
    @Body() body: { side: "ATTACKER" | "DEFENDER"; mode: "SINGLE" | "BERSERK"; weaponQuality?: number },
  ) {
    return this.fight.fight(citizen, battleId, body.side, body.mode, body.weaponQuality);
  }
}
