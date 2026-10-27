import { Controller, Get, Query } from "@nestjs/common";
import { StatsService } from "./stats.service";

@Controller("stats")
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get("countries")
  countries() {
    return this.stats.countryLeaderboard(10);
  }

  @Get("armies")
  armies() {
    return this.stats.armyLeaderboard(10);
  }

  @Get("citizens")
  citizens() {
    return this.stats.citizenLeaderboard(20);
  }

  @Get("daily")
  daily(@Query("day") day?: string) {
    return this.stats.dailyRollup(day ? Number(day) : 1);
  }
}
