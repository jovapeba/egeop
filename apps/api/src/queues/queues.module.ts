import { Module } from "@nestjs/common";
import { PoliticsModule } from "../politics/politics.module";
import { WarsModule } from "../wars/wars.module";
import { AuctionsModule } from "../auctions/auctions.module";
import { EventsModule } from "../events/events.module";
import { StocksModule } from "../stocks/stocks.module";
import { QueuesService } from "./queues.service";
import { EquipmentModule } from "../equipment/equipment.module";

@Module({
  imports: [PoliticsModule, WarsModule, AuctionsModule, EventsModule, StocksModule, EquipmentModule],
  providers: [QueuesService],
})
export class QueuesModule {}
