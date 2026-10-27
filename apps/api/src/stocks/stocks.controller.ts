import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { StocksService } from "./stocks.service";
import { CurrentCitizen } from "../common/current-citizen.decorator";

@Controller("stocks")
export class StocksController {
  constructor(private readonly stocks: StocksService) {}

  @Get("mine")
  mine(@CurrentCitizen() citizen: { id: string }) {
    return this.stocks.mine(citizen.id);
  }

  @Get()
  list() {
    return this.stocks.list();
  }

  @Post()
  create(
    @CurrentCitizen() citizen: { id: string },
    @Body() body: { name: string; sharesTotal: number },
  ) {
    return this.stocks.create(citizen.id, body.name, body.sharesTotal);
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.stocks.detail(id);
  }

  @Post(":id/issue")
  issue(
    @CurrentCitizen() citizen: { id: string },
    @Param("id") id: string,
    @Body() body: { quantity: number },
  ) {
    return this.stocks.issueShares(citizen.id, id, body.quantity);
  }

  @Post(":id/orders")
  order(
    @CurrentCitizen() citizen: { id: string },
    @Param("id") id: string,
    @Body() body: { side: "SELL" | "BUY"; quantity: number; price: number },
  ) {
    return this.stocks.createOrder(citizen.id, id, body.side, body.quantity, body.price);
  }

  @Post("orders/:id/cancel")
  cancel(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string) {
    return this.stocks.cancelOrder(citizen.id, id);
  }

  @Post(":id/dividends")
  dividends(
    @CurrentCitizen() citizen: { id: string },
    @Param("id") id: string,
    @Body() body: { totalGold: number },
  ) {
    return this.stocks.payDividends(citizen.id, id, body.totalGold);
  }

  @Post(":id/donate")
  donate(
    @CurrentCitizen() citizen: { id: string },
    @Param("id") id: string,
    @Body() body: { gold: number },
  ) {
    return this.stocks.donate(citizen.id, id, Number(body.gold ?? 0));
  }

  @Post(":id/polls")
  proposePoll(
    @CurrentCitizen() citizen: { id: string },
    @Param("id") id: string,
    @Body() body: { kind: string; payload: Record<string, unknown> },
  ) {
    return this.stocks.proposePoll(citizen.id, id, body);
  }

  @Post("polls/:id/vote")
  votePoll(
    @CurrentCitizen() citizen: { id: string },
    @Param("id") id: string,
    @Body() body: { yes: boolean },
  ) {
    return this.stocks.votePoll(citizen.id, id, body.yes);
  }
}
