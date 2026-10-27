import { Module } from "@nestjs/common";
import { MarketsService } from "./markets.service";
import { MarketsController } from "./markets.controller";

@Module({
  providers: [MarketsService],
  controllers: [MarketsController],
})
export class MarketsModule {}
