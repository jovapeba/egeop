import { BadRequestException, Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { MarketsService } from "./markets.service";
import { CurrentCitizen } from "../common/current-citizen.decorator";
import { PrismaService } from "../prisma/prisma.service";

@Controller("markets")
export class MarketsController {
  constructor(
    private readonly markets: MarketsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get("product")
  product(
    @Query("countryId") countryId?: string,
    @Query("product") product?: never,
    @Query("quality") quality?: string,
  ) {
    return this.markets.listProductOffers({
      countryId: countryId || undefined,
      product: product || undefined,
      quality: quality ? Number(quality) : undefined,
    });
  }

  @Post("product")
  createOffer(
    @CurrentCitizen() citizen: { id: string },
    @Body() body: { product: never; quality: number; unitPrice: number; stock: number },
  ) {
    return this.markets.createProductOffer(citizen.id, body.product, body.quality, body.unitPrice, body.stock);
  }

  @Post("product/:id/cancel")
  cancelOffer(@CurrentCitizen() citizen: { id: string }, @Param() p: { id: string }) {
    return this.markets.cancelProductOffer(citizen.id, p.id);
  }

  @Post("product/:id/buy")
  buy(@CurrentCitizen() citizen: { id: string }, @Param() p: { id: string }, @Body() body: { qty: number }) {
    return this.markets.buyProducts(citizen.id, p.id, body.qty);
  }

  @Get("monetary")
  monetary(@Query("sellAsset") sellAsset?: never, @Query("sellCountryId") sellCountryId?: string, @Query("buyAsset") buyAsset?: never) {
    return this.markets.listMonetaryOffers({
      sellAsset: (sellAsset as unknown as "GOLD" | "FIAT") || undefined,
      sellCountryId: sellCountryId || undefined,
      buyAsset: (buyAsset as unknown as "GOLD" | "FIAT") || undefined,
    });
  }

  @Post("monetary")
  createMonetary(
    @CurrentCitizen() citizen: { id: string },
    @Body() body: { sellAsset: "GOLD" | "FIAT"; sellCountryId?: string; sellAmount: number; rate: number; buyAsset: "GOLD" | "FIAT"; buyCountryId?: string },
  ) {
    return this.markets.createMonetaryOffer(citizen.id, body);
  }

  @Post("monetary/:id/buy")
  buyMonetary(@CurrentCitizen() citizen: { id: string }, @Param() p: { id: string }, @Body() body: { amount: number }) {
    return this.markets.buyMonetary(citizen.id, p.id, body.amount);
  }

  @Post("monetary/:id/cancel")
  cancelMonetary(@CurrentCitizen() citizen: { id: string }, @Param() p: { id: string }) {
    return this.markets.cancelMonetaryOffer(citizen.id, p.id);
  }

  @Get("taxes")
  taxes(@Query("countryId") countryId?: string) {
    if (!countryId) throw new BadRequestException("countryId required");
    return this.prisma.countryTax.findMany({ where: { countryId } });
  }
}
