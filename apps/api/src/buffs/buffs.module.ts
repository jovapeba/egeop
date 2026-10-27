import { Module } from "@nestjs/common";
import { BuffsService } from "./buffs.service";
import { BuffsController } from "./buffs.controller";

@Module({
  providers: [BuffsService],
  controllers: [BuffsController],
})
export class BuffsModule {}
