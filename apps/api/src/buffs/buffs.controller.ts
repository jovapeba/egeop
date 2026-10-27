import { Body, Controller, Get, Post } from "@nestjs/common";
import { BuffsService } from "./buffs.service";
import { CurrentCitizen } from "../common/current-citizen.decorator";

@Controller("buffs")
export class BuffsController {
  constructor(private readonly buffs: BuffsService) {}

  @Get("mine")
  mine(@CurrentCitizen() citizen: { id: string }) {
    return this.buffs.mine(citizen.id);
  }

  @Post()
  buy(@CurrentCitizen() citizen: { id: string }, @Body() body: { type: string }) {
    return this.buffs.buy(citizen.id, body.type as never);
  }
}
