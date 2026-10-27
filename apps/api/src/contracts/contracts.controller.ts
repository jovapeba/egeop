import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ContractsService } from "./contracts.service";
import { CurrentCitizen } from "../common/current-citizen.decorator";

@Controller("contracts")
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  list(@Query("status") status?: string) {
    return this.contracts.list(status || undefined);
  }

  @Get("audit")
  audit() {
    return this.contracts.auditLog();
  }

  @Post("loans")
  createLoan(
    @CurrentCitizen() citizen: { id: string },
    @Body() body: { amountGold: number; durationDays: number; interestPct: number },
  ) {
    return this.contracts.createLoan(citizen.id, body);
  }

  @Post("packs")
  createPack(
    @CurrentCitizen() citizen: { id: string },
    @Body() body: { amountGold: number; priceGold: number },
  ) {
    return this.contracts.createPackSale(citizen.id, body);
  }

  @Post(":id/accept")
  accept(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string) {
    return this.contracts.accept(citizen.id, id);
  }

  @Post(":id/repay")
  repay(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string) {
    return this.contracts.repay(citizen.id, id);
  }

  @Post(":id/cancel-staff")
  staffCancel(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string) {
    return this.contracts.staffCancel(citizen.id, id);
  }
}
