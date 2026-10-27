import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { RESOURCES, type Product, type Resource } from "@egeopolis/game-core";
import { Prisma } from "@prisma/client";
import { PrismaService, type Tx } from "../prisma/prisma.service";
import { GameService } from "../game/game.service";
import { RedisService } from "../redis/redis.service";

/** Default taxes when a country hasn't legislated product taxes yet. */
const DEFAULT_TAXES = { VAT: 1, IMPORT: 1, INCOME: 25 };

@Injectable()
export class MarketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService,
    private readonly redis: RedisService,
  ) {}

  // ===========================================================================
  // PRODUCT MARKET — per-country order book with VAT & import tax (wiki: Taxes)
  // ===========================================================================

  listProductOffers(opts: { countryId?: string; product?: Product; quality?: number }) {
    return this.prisma.productOffer.findMany({
      where: {
        active: true,
        ...(opts.countryId ? { countryId: opts.countryId } : {}),
        ...(opts.product ? { product: opts.product } : {}),
        ...(opts.quality ? { quality: opts.quality } : {}),
      },
      orderBy: { unitPrice: "asc" },
      take: 200,
    });
  }

  /** Sellers list stock on their own location's market. Stock escrowed at listing. */
  async createProductOffer(citizenId: string, product: Product, quality: number, unitPrice: number, stock: number) {
    if (unitPrice <= 0 || stock <= 0) throw new BadRequestException("price/stock must be positive");
    const citizen = await this.prisma.citizen.findUniqueOrThrow({
      where: { id: citizenId },
      include: { locationRegion: true },
    });
    await this.assertMarketEmbargo(citizen.citizenshipCountryId, "MARKETPLACE", "your country is under a marketplace embargo");
    const marketCountryId = citizen.locationRegion.countryId;
    const isRaw = RESOURCES.includes(product as Resource);
    const q = isRaw ? 0 : Math.min(5, Math.max(1, quality || 1));
    return this.redis.withLock(`stock:${citizenId}:${product}:${q}`, 6000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const escrowed = await this.game.subtractStorage(tx, "CITIZEN", citizenId, product, q, stock);
        if (!escrowed) throw new BadRequestException("not enough stock in storage");
        return tx.productOffer.create({
          data: {
            ownerId: citizenId,
            ownerType: "CITIZEN",
            countryId: marketCountryId,
            product,
            quality: q,
            unitPrice: BigInt(Math.round(unitPrice * 100)),
            stock,
            remaining: stock,
          },
        });
      }),
    );
  }

  async cancelProductOffer(citizenId: string, offerId: string) {
    return this.redis.withLock(`offer:${offerId}`, 5000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const offer = await tx.productOffer.findUnique({ where: { id: offerId } });
        if (!offer || offer.ownerId !== citizenId || !offer.active) {
          throw new ConflictException("offer not cancellable");
        }
        await tx.productOffer.update({ where: { id: offerId }, data: { active: false } });
        await this.game.addStorage(tx, "CITIZEN", citizenId, offer.product, offer.quality, offer.remaining);
        return { ok: true };
      }),
    );
  }

  async buyProducts(citizenId: string, offerId: string, qty: number) {
    const n = Math.max(1, Math.floor(qty || 1));
    return this.redis.withLock(`offer:${offerId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const offer = await tx.productOffer.findUnique({ where: { id: offerId } });
        if (!offer || !offer.active || offer.remaining < n) throw new ConflictException("not enough stock");
        const citizen = await tx.citizen.findUniqueOrThrow({
          where: { id: citizenId },
          include: { locationRegion: true },
        });

        // Buyers must be located in the market country (or an occupied region of it).
        if (citizen.locationRegion.countryId !== offer.countryId) {
          throw new ForbiddenException("travel to the market country to buy its goods");
        }
        await this.assertMarketEmbargo(citizen.citizenshipCountryId, "MARKETPLACE", "your country is under a marketplace embargo");

        const price = offer.unitPrice * BigInt(n);
        const taxRow = await tx.countryTax.findUnique({
          where: { countryId_product: { countryId: offer.countryId, product: offer.product } },
        });
        const vatPct = BigInt(taxRow?.vat ?? DEFAULT_TAXES.VAT);
        const importPct = BigInt(taxRow?.importTax ?? DEFAULT_TAXES.IMPORT);

        const vat = (price * vatPct) / BigInt(100);
        const foreign = await this.isForeignSeller(offer);
        const importTax = foreign ? (price * importPct) / BigInt(100) : BigInt(0);

        // Buyer pays price + VAT; seller receives price − import tax.
        try {
          await this.game.walletDebit(tx, citizenId, offer.countryId, price + vat, "MARKET_PURCHASE");
        } catch {
          throw new BadRequestException("not enough local currency on this market's wallet");
        }
        await this.game.walletCredit(tx, offer.ownerId, offer.countryId, price - importTax, "MARKET_SALE");

        if (vat > 0n) await this.game.treasuryFiatCredit(tx, offer.countryId, vat, "TAX", { kind: "VAT" });
        if (importTax > 0n) await this.game.treasuryFiatCredit(tx, offer.countryId, importTax, "TAX", { kind: "IMPORT" });

        await tx.productOffer.update({
          where: { id: offerId },
          data: {
            remaining: { decrement: n },
            active: offer.remaining - n <= 0 ? false : true,
          },
        });
        await this.game.addStorage(tx, "CITIZEN", citizenId, offer.product, offer.quality, n);
        await tx.productPurchase.create({
          data: {
            offerId,
            buyerId: citizenId,
            sellerId: offer.ownerId,
            product: offer.product,
            quality: offer.quality,
            quantity: n,
            unitPrice: offer.unitPrice,
            vatPaid: vat,
            importPaid: importTax,
          },
        });
        return { ok: true, spent: Number(price + vat) / 100 };
      }),
    );
  }

  /** Active embargo of `type` targeting the citizen's country blocks the transaction (wiki: Embargo). */
  private async assertMarketEmbargo(citizenshipCountryId: string | null, type: "MARKETPLACE" | "JOB" | "MONETARY", message: string) {
    if (!citizenshipCountryId) return;
    const embargo = await this.prisma.embargo.findFirst({
      where: { targetCountryId: citizenshipCountryId, type, active: true, until: { gt: new Date() } },
      select: { id: true },
    });
    if (embargo) throw new ForbiddenException(message);
  }

  /** Import tax applies when the seller's citizenship country differs from the market country. */
  private async isForeignSeller(offer: {
    ownerId: string;
    ownerType: { toString(): string };
    countryId: string;
  }): Promise<boolean> {
    if (offer.ownerType.toString() !== "CITIZEN") return false;
    const seller = await this.prisma.citizen.findUnique({
      where: { id: offer.ownerId },
      select: { citizenshipCountryId: true },
    });
    return !!seller && seller.citizenshipCountryId !== offer.countryId;
  }

  // ===========================================================================
  // MONETARY MARKET — limit order book: fiat ↔ gold / fiat ↔ fiat (wiki)
  // ===========================================================================

  listMonetaryOffers(opts: { sellAsset?: "GOLD" | "FIAT"; sellCountryId?: string; buyAsset?: "GOLD" | "FIAT" }) {
    return this.prisma.monetaryOffer.findMany({
      where: {
        active: true,
        ...(opts.sellAsset ? { sellAsset: opts.sellAsset } : {}),
        ...(opts.sellCountryId ? { sellCountryId: opts.sellCountryId } : {}),
        ...(opts.buyAsset ? { buyAsset: opts.buyAsset } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async createMonetaryOffer(
    citizenId: string,
    dto: {
      sellAsset: "GOLD" | "FIAT";
      sellCountryId?: string;
      sellAmount: number;
      rate: number;
      buyAsset: "GOLD" | "FIAT";
      buyCountryId?: string;
    },
  ) {
    const sellAmountCents = BigInt(Math.round(dto.sellAmount * 100));
    if (sellAmountCents <= 0n) throw new BadRequestException("amount must be positive");
    if (dto.rate <= 0) throw new BadRequestException("rate must be positive");
    if (dto.sellAsset === "FIAT" && !dto.sellCountryId) throw new BadRequestException("sellCountryId required for fiat");
    if (dto.buyAsset === "FIAT" && !dto.buyCountryId) throw new BadRequestException("buyCountryId required for fiat");
    if (dto.sellAsset === "FIAT" && dto.buyAsset === "FIAT" && dto.sellCountryId === dto.buyCountryId) {
      throw new BadRequestException("same currency on both sides");
    }
    const offerCitizen = await this.prisma.citizen.findUniqueOrThrow({
      where: { id: citizenId },
      select: { citizenshipCountryId: true },
    });
    await this.assertMarketEmbargo(offerCitizen.citizenshipCountryId, "MONETARY", "your country is under a monetary embargo");

    return this.redis.withLock(`mm:${citizenId}`, 6000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        // Escrow the sold amount.
        if (dto.sellAsset === "GOLD") {
          await this.game.moveGold(tx, { type: "CITIZEN", id: citizenId }, null, sellAmountCents, "OTHER");
        } else {
          await this.game.walletDebit(tx, citizenId, dto.sellCountryId!, sellAmountCents, "OTHER");
        }
        return tx.monetaryOffer.create({
          data: {
            ownerId: citizenId,
            sellAsset: dto.sellAsset,
            sellCountryId: dto.sellCountryId ?? null,
            sellAmount: sellAmountCents,
            remaining: sellAmountCents,
            rate: new Prisma.Decimal(dto.rate),
            buyAsset: dto.buyAsset,
            buyCountryId: dto.buyCountryId ?? null,
          },
        });
      }),
    );
  }

  async buyMonetary(citizenId: string, offerId: string, amount: number) {
    const amountCents = BigInt(Math.round(amount * 100));
    if (amountCents <= 0n) throw new BadRequestException("amount must be positive");
    return this.redis.withLock(`offer:${offerId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const offer = await tx.monetaryOffer.findUnique({ where: { id: offerId } });
        if (!offer || !offer.active || offer.remaining < amountCents) {
          throw new ConflictException("not enough remaining on offer");
        }
        const buyer = await tx.citizen.findUniqueOrThrow({ where: { id: citizenId }, select: { citizenshipCountryId: true } });
        const embargo = await tx.embargo.findFirst({
          where: { targetCountryId: buyer.citizenshipCountryId, type: "MONETARY", active: true, until: { gt: new Date() } },
          select: { id: true },
        });
        if (embargo) throw new ForbiddenException("your country is under a monetary embargo");
        const buyerAmountCents = BigInt(Math.ceil(Number(amountCents) * offer.rate.toNumber()));

        // Buyer pays buyAsset → seller; escrowed sellAsset → buyer.
        try {
          if (offer.buyAsset === "GOLD") {
            await this.game.moveGold(
              tx,
              { type: "CITIZEN", id: citizenId },
              { type: "CITIZEN", id: offer.ownerId },
              buyerAmountCents,
              "MONETARY_TRADE",
            );
          } else {
            await this.game.walletDebit(tx, citizenId, offer.buyCountryId!, buyerAmountCents, "OTHER");
            await this.game.walletCredit(tx, offer.ownerId, offer.buyCountryId!, buyerAmountCents, "MONETARY_TRADE");
          }
        } catch (e) {
          if (e instanceof Error && e.message === "INSUFFICIENT_GOLD") {
            throw new BadRequestException("not enough gold");
          }
          throw new BadRequestException("not enough currency in that wallet");
        }
        if (offer.sellAsset === "GOLD") {
          await this.game.moveGold(tx, null, { type: "CITIZEN", id: citizenId }, amountCents, "OTHER");
        } else {
          await this.game.walletCredit(tx, citizenId, offer.sellCountryId!, amountCents, "OTHER");
        }

        await tx.monetaryOffer.update({
          where: { id: offerId },
          data: {
            remaining: { decrement: amountCents },
            active: offer.remaining - amountCents <= 0n ? false : true,
          },
        });
        await tx.monetaryTrade.create({
          data: {
            offerId,
            buyerId: citizenId,
            sellerId: offer.ownerId,
            sellAsset: offer.sellAsset,
            buyAsset: offer.buyAsset,
            sellCountryId: offer.sellCountryId,
            buyCountryId: offer.buyCountryId,
            sellAmount: amountCents,
            buyAmount: buyerAmountCents,
            rate: offer.rate,
          },
        });
        return { ok: true, paid: Number(buyerAmountCents) / 100 };
      }),
    );
  }

  async cancelMonetaryOffer(citizenId: string, offerId: string) {
    return this.redis.withLock(`offer:${offerId}`, 5000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const offer = await tx.monetaryOffer.findUnique({ where: { id: offerId } });
        if (!offer || offer.ownerId !== citizenId || !offer.active) {
          throw new ConflictException("offer not cancellable");
        }
        await tx.monetaryOffer.update({ where: { id: offerId }, data: { active: false } });
        if (offer.sellAsset === "GOLD") {
          await this.game.moveGold(tx, null, { type: "CITIZEN", id: citizenId }, offer.remaining, "OTHER");
        } else {
          await this.game.walletCredit(tx, citizenId, offer.sellCountryId!, offer.remaining, "OTHER");
        }
        return { ok: true };
      }),
    );
  }
}
