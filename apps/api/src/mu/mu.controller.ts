import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { MuService } from "./mu.service";
import { CurrentCitizen } from "../common/current-citizen.decorator";

@Controller("mu")
export class MuController {
  constructor(private readonly mu: MuService) {}

  @Get()
  list(@Query("countryId") countryId?: string) {
    return this.mu.list(countryId || undefined);
  }

  @Get("mine")
  mine(@CurrentCitizen() citizen: { id: string }) {
    return this.mu.mine(citizen.id);
  }

  @Get(":id")
  detail(@Param("id") id: string, @CurrentCitizen() citizen: { id: string }) {
    return this.mu.detail(id, citizen.id);
  }

  @Post()
  create(@CurrentCitizen() citizen: { id: string }, @Body() body: { name: string; description?: string }) {
    return this.mu.create(citizen.id, body.name, body.description);
  }

  @Post(":id/join")
  join(
    @CurrentCitizen() citizen: { id: string; level: number; citizenshipCountryId: string },
    @Param("id") id: string,
    @Body() body: { message?: string },
  ) {
    return this.mu.apply(citizen, id, body.message);
  }

  @Post("leave")
  leave(@CurrentCitizen() citizen: { id: string }) {
    return this.mu.leave(citizen.id);
  }

  @Post(":id/upgrade")
  upgrade(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string) {
    return this.mu.upgrade(citizen.id, id);
  }

  @Post(":id/expand")
  expand(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string) {
    return this.mu.expand(citizen.id, id);
  }

  @Post(":id/promote")
  promote(
    @CurrentCitizen() citizen: { id: string },
    @Param("id") id: string,
    @Body() body: { citizenId: string; rank: "COMMANDER" | "CAPTAIN" | "RECRUIT" },
  ) {
    return this.mu.promote(citizen.id, id, body.citizenId, body.rank);
  }

  @Post(":id/orders")
  order(
    @CurrentCitizen() citizen: { id: string },
    @Param("id") id: string,
    @Body() body: { battleId: string; side: "ATTACKER" | "DEFENDER" },
  ) {
    return this.mu.setOrder(citizen.id, id, body.battleId, body.side);
  }

  @Post(":id/vault")
  donate(
    @CurrentCitizen() citizen: { id: string },
    @Param("id") id: string,
    @Body() body: { gold?: number; product?: never; quality?: number; qty?: number },
  ) {
    return this.mu.donate(citizen.id, id, body);
  }

  @Post(":id/supply")
  supply(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string) {
    return this.mu.supply(citizen.id, id);
  }

  @Post(":id/auto-supply")
  autoSupply(
    @CurrentCitizen() citizen: { id: string },
    @Param("id") id: string,
    @Body() body: { companyId: string; product: never; quality: number; perShift: number },
  ) {
    return this.mu.configureAutoSupply(citizen.id, id, body.companyId, body.product, body.quality, body.perShift);
  }
}
