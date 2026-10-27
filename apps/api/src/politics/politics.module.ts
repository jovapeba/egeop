import { Module } from "@nestjs/common";
import { WarsModule } from "../wars/wars.module";
import { PoliticsService } from "./politics.service";
import { PoliticsController } from "./politics.controller";

@Module({
  imports: [WarsModule],
  providers: [PoliticsService],
  controllers: [PoliticsController],
  exports: [PoliticsService],
})
export class PoliticsModule {}
