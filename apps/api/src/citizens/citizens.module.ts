import { Module } from "@nestjs/common";
import { CitizensService } from "./citizens.service";
import { CitizensController } from "./citizens.controller";

@Module({
  providers: [CitizensService],
  controllers: [CitizensController],
})
export class CitizensModule {}
