import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { AuctionsService } from "./auctions.service";
import { CurrentCitizen } from "../common/current-citizen.decorator";

@Controller("auctions")
export class AuctionsController {
  constructor(private readonly auctions: AuctionsService) {}

  @Get()
  list(@Query("status") status?: never) {
    return this.auctions.list((status as never) || "ACTIVE");
  }

  @Get("mine")
  mine(@CurrentCitizen() citizen: { id: string }) {
    return this.auctions.mine(citizen.id);
  }

  @Post()
  listAuction(
    @CurrentCitizen() citizen: { id: string },
    @Body() body: { kind: "WA" | "SPECIAL_ITEM"; itemId?: string; itemKey?: string; startPriceGold: number; durationHours: number },
  ) {
    return this.auctions.listAuction(citizen.id, body);
  }

  @Post(":id/bid")
  bid(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string, @Body() body: { amountGold: number }) {
    return this.auctions.bid(citizen, id, body.amountGold);
  }

  @Post(":id/cancel")
  cancel(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string) {
    return this.auctions.cancel(citizen.id, id);
  }

  @Post("settle")
  settle(@CurrentCitizen() citizen: { isAdmin: boolean }) {
    if (!citizen.isAdmin) return { forbidden: true };
    return this.auctions.settleFinished();
  }
}
