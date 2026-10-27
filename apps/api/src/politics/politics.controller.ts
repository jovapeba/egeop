import { BadRequestException, Body, Controller, ForbiddenException, Get, Param, Post, Query } from "@nestjs/common";
import { PoliticsService } from "./politics.service";
import { CurrentCitizen } from "../common/current-citizen.decorator";
import { PrismaService } from "../prisma/prisma.service";

@Controller("politics")
export class PoliticsController {
  constructor(
    private readonly politics: PoliticsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("parties")
  parties(@Query("countryId") countryId?: string, @CurrentCitizen() citizen?: { id: string }) {
    return this.politics.parties(countryId || undefined, citizen?.id);
  }

  @Post("parties/:id/join")
  joinParty(@CurrentCitizen() citizen: { id: string; level: number }, @Param("id") id: string) {
    return this.politics.joinParty(citizen, id);
  }

  @Post("parties/leave")
  leaveParty(@CurrentCitizen() citizen: { id: string }) {
    return this.politics.leaveParty(citizen.id);
  }

  @Get("elections")
  elections(@Query("countryId") countryId?: string, @CurrentCitizen() citizen?: { id: string }) {
    return this.politics.elections(countryId ?? "", citizen?.id);
  }

  @Post("elections/:id/candidacy")
  candidacy(
    @CurrentCitizen() citizen: { id: string; level: number; citizenshipCountryId: string },
    @Param("id") id: string,
    @Body() body: { presentation?: string },
  ) {
    return this.politics.candidacy(citizen, id, body.presentation);
  }

  @Post("elections/:id/vote")
  vote(
    @CurrentCitizen() citizen: { id: string; level: number; citizenshipCountryId: string },
    @Param("id") id: string,
    @Body() body: { candidateId: string },
  ) {
    return this.politics.vote(citizen, id, body.candidateId);
  }

  @Get("laws")
  laws(@Query("countryId") countryId?: string, @Query("status") status?: string) {
    if (!countryId) throw new BadRequestException("countryId required");
    return this.politics.laws(countryId, status || undefined);
  }

  @Post("laws")
  propose(
    @CurrentCitizen() citizen: { id: string; level: number; citizenshipCountryId: string },
    @Body() body: { type: string; payload: Record<string, unknown> },
  ) {
    return this.politics.proposeLaw(citizen, body.type, body.payload);
  }

  @Post("laws/:id/vote")
  voteLaw(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string, @Body() body: { yes: boolean }) {
    return this.politics.voteLaw(citizen.id, id, body.yes);
  }

  /** Citizenship request (wiki): 30g fee; paused during Patriot Week. */
  @Post("citizenship")
  applyCitizenship(@CurrentCitizen() citizen: { id: string }, @Body() body: { toCountryId: string }) {
    return this.politics.applyCitizenship(citizen, body.toCountryId);
  }

  /** Congress sponsor of the target country opens the vote. */
  @Post("citizenship/:id/sponsor")
  sponsorCitizenship(@CurrentCitizen() citizen: { id: string; citizenshipCountryId: string }, @Param("id") id: string) {
    return this.politics.sponsorCitizenship(citizen, id);
  }

  @Get("treasury")
  async treasury(@Query("countryId") countryId?: string) {
    const id = countryId;
    if (!id) throw new BadRequestException("countryId required");
    return this.prisma.country.findUniqueOrThrow({
      where: { id },
      select: { id: true, name: true, treasuryGold: true, treasuryFiat: true, minSalary: true, presidentId: true },
    });
  }

  @Get("alliances")
  alliances() {
    return this.politics.allianceList();
  }

  @Get("cabinet")
  cabinet(@Query("countryId") countryId?: string) {
    if (!countryId) throw new BadRequestException("countryId required");
    return this.politics.cabinet(countryId);
  }

  @Post("ministers")
  async assignMinister(
    @CurrentCitizen() citizen: { id: string; citizenshipCountryId: string },
    @Body() body: { citizenId: string; role: string },
  ) {
    return this.politics.assignMinister(citizen, body.role, body.citizenId);
  }

  @Post("ministers/fire")
  async fireMinister(
    @CurrentCitizen() citizen: { id: string; citizenshipCountryId: string },
    @Body() body: { role: string },
  ) {
    return this.politics.fireMinister(citizen, body.role);
  }

  @Post("cabinet/resign")
  async resignRole(@CurrentCitizen() citizen: { id: string; citizenshipCountryId: string }) {
    return this.politics.resignRole(citizen);
  }

  // ===========================================================================
  // NATIONAL ORGANISATION (Country → Politics)
  // ===========================================================================

  /** Dev/testing helper: force-finalize expired laws now (admins only). */
  @Post("dev-sweep")
  async devSweep(@CurrentCitizen() citizen: { isAdmin: boolean }) {
    if (!citizen.isAdmin) throw new ForbiddenException("admins only");
    const laws = await this.politics.sweepExpiredLaws();
    return laws;
  }

  @Get("org")
  org(@Query("countryId") countryId?: string) {
    if (!countryId) throw new BadRequestException("countryId required");
    return this.politics.orgInfo(countryId);
  }

  @Post("org/donate")
  donateToOrg(
    @CurrentCitizen() citizen: { id: string; citizenshipCountryId: string },
    @Body() body: { gold?: number; fiat?: number },
  ) {
    return this.politics.donateToOrg(citizen.id, citizen.citizenshipCountryId, Number(body.gold ?? 0), Number(body.fiat ?? 0));
  }

  @Post("org/withdraw")
  orgWithdraw(
    @CurrentCitizen() citizen: { id: string; citizenshipCountryId: string },
    @Body() body: { toCitizenId: string; gold?: number; fiat?: number },
  ) {
    return this.politics.orgWithdraw(citizen, body.toCitizenId, Number(body.gold ?? 0), Number(body.fiat ?? 0));
  }

  @Get("broadcast")
  getBroadcast(@CurrentCitizen() citizen: { citizenshipCountryId: string }) {
    return this.politics.getCountryBroadcast(citizen.citizenshipCountryId);
  }

  @Post("broadcast")
  setBroadcast(
    @CurrentCitizen() citizen: { id: string; citizenshipCountryId: string },
    @Body() body: { message: string },
  ) {
    return this.politics.setCountryBroadcast(citizen, body.message);
  }
}
