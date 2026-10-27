import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, Auction, type AuctionBid, type AuctionStatus } from "@prisma/client";
import { PrismaService, type Tx } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

const GOLD = (g: number) => BigInt(Math.round(g * 100));

export const AUCTION_DURATIONS_H = [1, 6, 12, 24, 48];
export const SNIPER_WINDOW_SECONDS = 30;
export const MIN_OUTBID_PCT = 3;
export const LIST_FEE_PCT = 0.01; // 1% of starting price on listing
export const SALE_FEE_PCT = 0.02; // 2% of final price when sold

@Injectable()
export class AuctionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  list(status: AuctionStatus = "ACTIVE") {
    return this.prisma.auction.findMany({
      where: { status },
      include: {
        bids: { orderBy: { amount: "desc" }, take: 3, include: { bidder: { select: { nickname: true } } } },
      },
      orderBy: { endsAt: "asc" },
      take: 100,
    });
  }

  async mine(citizenId: string) {
    const selling = await this.prisma.auction.findMany({
      where: { sellerId: citizenId },
      include: { bids: { orderBy: { amount: "desc" }, take: 3, include: { bidder: { select: { nickname: true } } } } },
      orderBy: { createdAt: "desc" },
    });
    const bidding = await this.prisma.auctionBid.findMany({
      where: { bidderId: citizenId },
      orderBy: { createdAt: "desc" },
      include: { auction: true },
    });
    return { selling, bidding };
  }

  /**
   * List an attachment or special item. 1% of start price deducted immediately.
   * Cancellation only allowed with zero bids.
   */
  async listAuction(
    citizenId: string,
    dto: { kind: "WA" | "SPECIAL_ITEM"; itemId?: string; itemKey?: string; startPriceGold: number; durationHours: number },
  ) {
    if (dto.startPriceGold <= 0) throw new BadRequestException("start price must be positive");
    if (!AUCTION_DURATIONS_H.includes(dto.durationHours)) {
      throw new BadRequestException(`duration must be one of ${AUCTION_DURATIONS_H.join(", ")}h`);
    }
    if (dto.kind === "WA" && !dto.itemId) throw new BadRequestException("itemId required for attachments");
    if (dto.kind === "SPECIAL_ITEM" && !dto.itemKey) throw new BadRequestException("itemKey required for special items");

    return this.redis.withLock(`gold:${citizenId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const startPrice = GOLD(dto.startPriceGold);
        const listFee = (startPrice * BigInt(LIST_FEE_PCT * 100)) / BigInt(100);
        await tx.citizen.updateMany({
          where: { id: citizenId, gold: { gte: listFee } },
          data: { gold: { decrement: listFee } },
        });
        await tx.transaction.create({
          data: { asset: "GOLD", reason: "AUCTION_FEE", amount: -listFee, fromType: "CITIZEN", fromId: citizenId },
        });

        if (dto.kind === "WA") {
          const item = await tx.equipmentItem.findUnique({ where: { id: dto.itemId } });
          if (!item || item.ownerId !== citizenId) throw new ForbiddenException("attachment not owned");
          const equipped = await tx.equippedSlot.findFirst({ where: { itemId: item.id } });
          if (equipped) throw new ConflictException("unequip before auctioning");
          await tx.equipmentItem.update({ where: { id: item.id }, data: { ownerId: "" } });
        } else {
          // escrow one special item unit
          const row = await tx.storage.findUnique({
            where: { ownerType_ownerId_product_quality: { ownerType: "CITIZEN", ownerId: citizenId, product: "SPECIAL_ITEM", quality: 0 } },
          });
          if (!row || row.quantity < 1) throw new BadRequestException("no special item units in storage");
          await tx.storage.update({ where: { id: row.id }, data: { quantity: { decrement: 1 } } });
        }

        return tx.auction.create({
          data: {
            sellerId: citizenId,
            kind: dto.kind,
            itemId: dto.kind === "WA" ? dto.itemId! : dto.itemKey!,
            startPrice,
            endsAt: new Date(Date.now() + dto.durationHours * 3600_000),
            listFeePaid: listFee,
          },
        });
      }),
    );
  }

  /** Bid: public, min outbid = top + 3%; 30s sniper rollback extends the timer. */
  async bid(citizen: { id: string }, auctionId: string, amountGold: number) {
    const amount = GOLD(amountGold);
    return this.redis.withLock(`auction:${auctionId}`, 10000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const auction = await tx.auction.findUniqueOrThrow({ where: { id: auctionId } });
        if (auction.status !== "ACTIVE") throw new ConflictException("auction closed");
        if (new Date(auction.endsAt) < new Date()) throw new ConflictException("auction ended");
        if (auction.sellerId === citizen.id) throw new ForbiddenException("cannot bid on your own auction");

        const minBid = auction.currentBid
          ? auction.currentBid + (auction.currentBid * BigInt(MIN_OUTBID_PCT)) / BigInt(100)
          : auction.startPrice;
        if (amount < minBid) {
          throw new BadRequestException(`minimum outbid is ${(Number(minBid) / 100).toFixed(4)}g (top + 3%)`);
        }

        // Refund the previous top bidder.
        if (auction.currentBidderId) {
          await tx.citizen.update({
            where: { id: auction.currentBidderId },
            data: { gold: { increment: auction.currentBid! } },
          });
          await tx.transaction.create({
            data: { asset: "GOLD", reason: "OTHER", amount: auction.currentBid!, toType: "CITIZEN", toId: auction.currentBidderId, meta: { refund: auctionId } as Prisma.InputJsonValue },
          });
        }
        // Escrow the new bid.
        const res = await tx.citizen.updateMany({
          where: { id: citizen.id, gold: { gte: amount } },
          data: { gold: { decrement: amount } },
        });
        if (res.count === 0) throw new BadRequestException("not enough gold");
        await tx.transaction.create({
          data: { asset: "GOLD", reason: "OTHER", amount: -amount, fromType: "CITIZEN", fromId: citizen.id, meta: { bid: auctionId } as Prisma.InputJsonValue },
        });

        await tx.auctionBid.create({ data: { auctionId, bidderId: citizen.id, amount } });
        const endsAt = new Date(auction.endsAt);
        let extended = false;
        if ((endsAt.getTime() - Date.now()) / 1000 < SNIPER_WINDOW_SECONDS) {
          endsAt.setTime(Date.now() + SNIPER_WINDOW_SECONDS * 1000);
          extended = true;
        }
        await tx.auction.update({
          where: { id: auctionId },
          data: { currentBid: amount, currentBidderId: citizen.id, endsAt },
        });
        if (extended) {
          await this.redis.publish(`auction:${auctionId}`, { type: "auction:timer_extended", auctionId, endsAt: endsAt.toISOString() });
        } else {
          await this.redis.publish(`auction:${auctionId}`, { type: "auction:bid", auctionId, amount: Number(amount) / 100, bidderId: citizen.id, endsAt: endsAt.toISOString() });
        }
        return { ok: true, endsAt: endsAt.toISOString(), extended };
      }),
    );
  }

  async cancel(citizenId: string, auctionId: string) {
    return this.redis.withLock(`auction:${auctionId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const auction = await tx.auction.findUniqueOrThrow({ where: { id: auctionId } });
        if (auction.sellerId !== citizenId) throw new ForbiddenException("seller only");
        if (auction.status !== "ACTIVE") throw new ConflictException("not active");
        const bidCount = await tx.auctionBid.count({ where: { auctionId } });
        if (bidCount > 0) throw new ConflictException("cannot cancel after bids");

        await tx.auction.update({ where: { id: auctionId }, data: { status: "CANCELLED" } });
        if (auction.kind === "WA") {
          await tx.equipmentItem.update({ where: { id: auction.itemId }, data: { ownerId: citizenId } });
        } else {
          await tx.storage.upsert({
            where: { ownerType_ownerId_product_quality: { ownerType: "CITIZEN", ownerId: citizenId, product: "SPECIAL_ITEM", quality: 0 } },
            create: { ownerType: "CITIZEN", ownerId: citizenId, product: "SPECIAL_ITEM", quality: 0, quantity: 1 },
            update: { quantity: { increment: 1 } },
          });
        }
        return { ok: true };
      }),
    );
  }

  /** Sweep: settle finished auctions (transfer item to winner, pay seller minus 2%). */
  async settleFinished() {
    const finished = await this.prisma.auction.findMany({
      where: { status: "ACTIVE", endsAt: { lt: new Date() } },
      take: 50,
    });
    for (const auction of finished) {
      await this.redis.withLock(`auction:${auction.id}`, 15000, () =>
        this.prisma.$transaction(async (tx: Tx) => {
          if (auction.currentBidderId && auction.currentBid) {
            const fee = (auction.currentBid * BigInt(SALE_FEE_PCT * 100)) / BigInt(100);
            const proceeds = auction.currentBid - fee;
            await tx.citizen.update({ where: { id: auction.sellerId }, data: { gold: { increment: proceeds } } });
            await tx.transaction.create({
              data: { asset: "GOLD", reason: "AUCTION_FEE", amount: fee, fromType: "AUCTION", fromId: auction.id },
            });
            if (auction.kind === "WA") {
              await tx.equipmentItem.update({ where: { id: auction.itemId }, data: { ownerId: auction.currentBidderId } });
            } else {
              await tx.storage.upsert({
                where: { ownerType_ownerId_product_quality: { ownerType: "CITIZEN", ownerId: auction.currentBidderId, product: "SPECIAL_ITEM", quality: 0 } },
                create: { ownerType: "CITIZEN", ownerId: auction.currentBidderId, product: "SPECIAL_ITEM", quality: 0, quantity: 1 },
                update: { quantity: { increment: 1 } },
              });
            }
            await tx.auction.update({ where: { id: auction.id }, data: { status: "SOLD" } });
          } else {
            // unsold → return item to seller (no sale fee)
            if (auction.kind === "WA") {
              await tx.equipmentItem.update({ where: { id: auction.itemId }, data: { ownerId: auction.sellerId } });
            } else {
              await tx.storage.upsert({
                where: { ownerType_ownerId_product_quality: { ownerType: "CITIZEN", ownerId: auction.sellerId, product: "SPECIAL_ITEM", quality: 0 } },
                create: { ownerType: "CITIZEN", ownerId: auction.sellerId, product: "SPECIAL_ITEM", quality: 0, quantity: 1 },
                update: { quantity: { increment: 1 } },
              });
            }
            await tx.auction.update({ where: { id: auction.id }, data: { status: "CANCELLED" } });
          }
        }),
      );
    }
    return { settled: finished.length };
  }
}
