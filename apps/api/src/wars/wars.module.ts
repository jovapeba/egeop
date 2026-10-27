import { Module } from "@nestjs/common";
import { WarsService } from "./wars.service";
import { FightService } from "./fight.service";
import { BattleGateway } from "./battle.gateway";
import { WarsController } from "./wars.controller";
import { EquipmentModule } from "../equipment/equipment.module";

@Module({
  imports: [EquipmentModule],
  providers: [WarsService, FightService, BattleGateway],
  controllers: [WarsController],
  exports: [WarsService],
})
export class WarsModule {}
