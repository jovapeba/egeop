import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CompaniesService } from "./companies.service";
import { CurrentCitizen } from "../common/current-citizen.decorator";

@Controller("companies")
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get("mine")
  mine(@CurrentCitizen() citizen: { id: string }) {
    return this.companies.mine(citizen.id);
  }

  @Get("market")
  market() {
    return this.companies.companyMarket();
  }

  @Get("jobs")
  jobs(@Query("countryId") countryId?: string, @CurrentCitizen() citizen?: { id: string }) {
    return this.companies.jobMarket(countryId || undefined, citizen?.id);
  }

  @Post()
  create(
    @CurrentCitizen() citizen: { id: string },
    @Body() body: { name: string; product: never; regionId: string },
  ) {
    return this.companies.create(citizen.id, body.name, body.product, body.regionId);
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.companies.detail(id);
  }

  @Post(":id/upgrade")
  upgrade(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string) {
    return this.companies.upgrade(citizen.id, id);
  }

  @Post(":id/downgrade")
  downgrade(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string) {
    return this.companies.downgrade(citizen.id, id);
  }

  @Post(":id/relocate")
  relocate(
    @CurrentCitizen() citizen: { id: string },
    @Param("id") id: string,
    @Body() body: { regionId: string },
  ) {
    return this.companies.relocate(citizen.id, id, body.regionId);
  }

  @Post(":id/industry")
  industry(
    @CurrentCitizen() citizen: { id: string },
    @Param("id") id: string,
    @Body() body: { product: never },
  ) {
    return this.companies.changeIndustry(citizen.id, id, body.product);
  }

  @Post(":id/relocate-industry")
  relocateIndustry(
    @CurrentCitizen() citizen: { id: string },
    @Param("id") id: string,
    @Body() body: { regionId: string; product: never },
  ) {
    return this.companies.relocateAndChangeIndustry(citizen.id, id, body.regionId, body.product);
  }

  @Post(":id/sale")
  listForSale(
    @CurrentCitizen() citizen: { id: string },
    @Param("id") id: string,
    @Body() body: { price: number },
  ) {
    return this.companies.listForSale(citizen.id, id, body.price);
  }

  @Post(":id/sale/cancel")
  unlist(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string) {
    return this.companies.unlistForSale(citizen.id, id);
  }

  @Post(":id/buy")
  buy(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string) {
    return this.companies.buyCompany(citizen.id, id);
  }

  @Post(":id/jobs")
  postJob(
    @CurrentCitizen() citizen: { id: string },
    @Param("id") id: string,
    @Body() body: { minEcoSkill: number; salary: number },
  ) {
    return this.companies.postJob(citizen.id, id, body.minEcoSkill, body.salary);
  }

  @Post("jobs/:offerId/apply")
  applyJob(@CurrentCitizen() citizen: { id: string }, @Param("offerId") offerId: string) {
    return this.companies.applyJob(citizen.id, offerId);
  }

  @Post("jobs/quit")
  quitJob(@CurrentCitizen() citizen: { id: string }) {
    return this.companies.quitJob(citizen.id);
  }

  @Post(":id/withdraw")
  withdraw(
    @CurrentCitizen() citizen: { id: string },
    @Param("id") id: string,
    @Body() body: { product: never; quality: number; qty: number },
  ) {
    return this.companies.withdraw(citizen.id, id, body.product, body.quality, body.qty);
  }

  @Post(":id/deposit")
  deposit(
    @CurrentCitizen() citizen: { id: string },
    @Param("id") id: string,
    @Body() body: { product: never; quality: number; qty: number },
  ) {
    return this.companies.deposit(citizen.id, id, body.product, body.quality, body.qty);
  }

  @Post(":id/withdraw-fiat")
  withdrawFiat(
    @CurrentCitizen() citizen: { id: string },
    @Param("id") id: string,
    @Body() body: { amount: number },
  ) {
    return this.companies.withdrawFiat(citizen.id, id, body.amount);
  }

  @Post(":id/deposit-fiat")
  depositFiat(
    @CurrentCitizen() citizen: { id: string },
    @Param("id") id: string,
    @Body() body: { amount: number },
  ) {
    return this.companies.depositFiat(citizen.id, id, body.amount);
  }
}
