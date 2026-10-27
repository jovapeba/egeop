import { Body, Controller, Get, Post } from "@nestjs/common";
import { ActionsService } from "./actions.service";
import { CurrentCitizen } from "../common/current-citizen.decorator";

@Controller("actions")
export class ActionsController {
  constructor(private readonly actions: ActionsService) {}

  @Get("daily-tasks")
  dailyTasks(@CurrentCitizen() citizen: { id: string }) {
    return this.actions.dailyTasks(citizen.id);
  }

  @Post("train")
  train(@CurrentCitizen() citizen: { id: string }) {
    return this.actions.train(citizen.id);
  }

  @Post("work")
  work(@CurrentCitizen() citizen: { id: string }) {
    return this.actions.work(citizen.id);
  }

  @Post("consume")
  consume(
    @CurrentCitizen() citizen: { id: string },
    @Body() body: { kind: "FOOD" | "ENERGY_DRINK" | "FIRST_AID_KIT"; quality: number; qty: number },
  ) {
    return this.actions.consume(citizen.id, body.kind, body.quality, body.qty);
  }

  @Post("watch-ad")
  watchAd(@CurrentCitizen() citizen: { id: string }) {
    return this.actions.watchAd(citizen.id);
  }

  @Post("repair")
  repair(@CurrentCitizen() citizen: { id: string }, @Body() body: { asset: "PANTRY" | "FRIDGE" }) {
    return this.actions.repair(citizen.id, body.asset);
  }
}
