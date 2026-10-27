import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CitizensService } from "./citizens.service";
import { CurrentCitizen } from "../common/current-citizen.decorator";

@Controller("citizens")
export class CitizensController {
  constructor(private readonly citizens: CitizensService) {}

  @Get("leaderboard")
  leaderboard() {
    return this.citizens.leaderboard("totalDamage", 20);
  }

  @Get("me/storage")
  storage(@CurrentCitizen() citizen: { id: string }) {
    return this.citizens.storage(citizen.id);
  }

  @Get("me/notifications")
  notifications(@CurrentCitizen() citizen: { id: string }) {
    return this.citizens.notifications(citizen.id);
  }

  @Get("me/achievements")
  achievements(@CurrentCitizen() citizen: { id: string }) {
    return this.citizens.achievements(citizen.id);
  }

  @Get("map")
  map() {
    return this.citizens.worldMap();
  }


  /** Public shared-IP registry & logs (wiki). */
  @Get("shared-ip")
  sharedIpRegistry() {
    return this.citizens.sharedIpRegistry();
  }

  @Get(":id")
  profile(@Param("id") id: string) {
    return this.citizens.getProfile(id);
  }

  /** Profile settings (wiki): avatar color, tutorial guide & toggle, hotlist. */
  @Patch("me/settings")
  updateSettings(
    @CurrentCitizen() citizen: { id: string },
    @Body() body: { avatarColor?: string; guide?: string; enableTutorial?: boolean; shortcuts?: string[] },
  ) {
    return this.citizens.updateSettings(citizen.id, body);
  }

  @Get("me/packs")
  packCatalog(@CurrentCitizen() citizen: { id: string }) {
    return this.citizens.packCatalog(citizen.id);
  }

  /** Shared-IP registration (wiki): declare the 2nd account on the same IP. */
  @Post("me/shared-ip")
  registerSharedIp(@CurrentCitizen() citizen: { id: string }, @Body() body: { secondAccountNickname: string }) {
    return this.citizens.registerSharedIp(citizen.id, body.secondAccountNickname);
  }

  /** Simulated payment gateway (wiki): Bronze / Silver / Gold packs. */
  @Post("me/packs/:pack")
  buyPack(@CurrentCitizen() citizen: { id: string }, @Param("pack") pack: string) {
    return this.citizens.buyPack(citizen.id, pack);
  }

  @Post("me/travel")
  travel(
    @CurrentCitizen() citizen: { id: string },
    @Body() body: { regionId: string; ticketQuality: number },
  ) {
    return this.citizens.travel(citizen.id, body.regionId, body.ticketQuality);
  }
}
