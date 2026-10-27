import { Module } from "@nestjs/common";
import { MuService } from "./mu.service";
import { MuController } from "./mu.controller";

@Module({
  providers: [MuService],
  controllers: [MuController],
})
export class MuModule {}
