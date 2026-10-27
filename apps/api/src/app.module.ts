import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { GameModule } from "./game/game.module";
import { AuthModule } from "./auth/auth.module";
import { RatingsModule } from "./ratings/ratings.module";
import { FriendsModule } from "./friends/friends.module";
import { CitizensModule } from "./citizens/citizens.module";
import { ActionsModule } from "./actions/actions.module";
import { EquipmentModule } from "./equipment/equipment.module";
import { CompaniesModule } from "./companies/companies.module";
import { MarketsModule } from "./markets/markets.module";
import { StocksModule } from "./stocks/stocks.module";
import { WarsModule } from "./wars/wars.module";
import { MuModule } from "./mu/mu.module";
import { PoliticsModule } from "./politics/politics.module";
import { MediaModule } from "./media/media.module";
import { QueuesModule } from "./queues/queues.module";
import { AuctionsModule } from "./auctions/auctions.module";
import { ContractsModule } from "./contracts/contracts.module";
import { EventsModule } from "./events/events.module";
import { StatsModule } from "./stats/stats.module";
import { BuffsModule } from "./buffs/buffs.module";
import { StaffModule } from "./staff/staff.module";
import { ChatModule } from "./chat/chat.module";
import { JwtAuthGuard } from "./common/jwt-auth.guard";
import { SerializeInterceptor } from "./common/serialize.interceptor";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || "dev-secret-change-me",
      signOptions: { expiresIn: "30d" },
    }),
    GameModule,
    AuthModule,
    CitizensModule,
    ActionsModule,
    EquipmentModule,
    CompaniesModule,
    MarketsModule,
    StocksModule,
    WarsModule,
    MuModule,
    PoliticsModule,
    MediaModule,
    QueuesModule,
    ChatModule,
    AuctionsModule,
    ContractsModule,
    EventsModule,
    StatsModule,
    BuffsModule,
    StaffModule,
    RatingsModule,
    FriendsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: SerializeInterceptor },
  ],
})
export class AppModule {}
