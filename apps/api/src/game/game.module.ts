import { Global, Module } from "@nestjs/common";
import { GameService } from "./game.service";

/** Global shared foundation: ledger, storage, medals, progression, equipment aggregation. */
@Global()
@Module({
  providers: [GameService],
  exports: [GameService],
})
export class GameModule {}
