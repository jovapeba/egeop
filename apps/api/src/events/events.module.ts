import { Module } from "@nestjs/common";
import { EventsService } from "./events.service";
import { SpecialEventsService } from "./special-events.service";
import { EventsController } from "./events.controller";
import { EquipmentModule } from "../equipment/equipment.module";

@Module({
  imports: [EquipmentModule],
  providers: [EventsService, SpecialEventsService],
  controllers: [EventsController],
  exports: [EventsService, SpecialEventsService],
})
export class EventsModule {}
