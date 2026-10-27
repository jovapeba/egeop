import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { EventsService } from "./events.service";
import { SpecialEventsService } from "./special-events.service";
import { CurrentCitizen } from "../common/current-citizen.decorator";

@Controller("events")
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly special: SpecialEventsService,
  ) {}

  // --- Special events (staff) -------------------------------------------------

  @Post("special")
  specialCreate(
    @CurrentCitizen() citizen: { isAdmin: boolean },
    @Body() body: { type: string; startsInMinutes?: number; durationHours?: number; defenderCountryId?: string; regionId?: string },
  ) {
    if (!citizen.isAdmin) return { forbidden: true };
    return this.special.adminCreate(body as never);
  }

  @Get("special")
  specialList() {
    return this.special.list();
  }

  @Post("special/tick")
  specialTick(@CurrentCitizen() citizen: { isAdmin: boolean }) {
    if (!citizen.isAdmin) return { forbidden: true };
    return this.special.tick();
  }

  @Get()
  list(@Query("status") status?: string) {
    return this.events.list(status || undefined);
  }

  @Post()
  create(
    @CurrentCitizen() citizen: { id: string; isAdmin: boolean },
    @Body() body: { type: string; startsInMinutes?: number; config?: Record<string, unknown> },
  ) {
    return this.events.create(citizen.id, body);
  }

  @Post(":id/register")
  register(
    @CurrentCitizen() citizen: { id: string; citizenshipCountryId: string },
    @Param("id") id: string,
    @Body() body: { name?: string },
  ) {
    return this.events.register(citizen, id, body.name);
  }

  /** One hit in a bracket/battle match (costs 10 HP + 1 ammo). */
  @Post("matches/:id/hit")
  hitMatch(
    @CurrentCitizen() citizen: { id: string; citizenshipCountryId: string; hp: number; level: number; strength: number; locationRegionId: string },
    @Param("id") id: string,
  ) {
    return this.events.hitMatch(citizen, id);
  }

  /** One hit in a melee event (FIRST_AID, QUICKDROP_CUP) — live country counter. */
  @Post(":id/hit")
  hitMelee(
    @CurrentCitizen() citizen: { id: string; citizenshipCountryId: string; hp: number; level: number; strength: number; locationRegionId: string },
    @Param("id") id: string,
  ) {
    return this.events.hitMelee(citizen, id);
  }

  @Post("tick")
  tick(@CurrentCitizen() citizen: { isAdmin: boolean }) {
    if (!citizen.isAdmin) return { forbidden: true };
    return this.events.tick();
  }
}
