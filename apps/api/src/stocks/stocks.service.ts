import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { JSC_CREATE_COST, JSC_FEE_SHARE, JSC_INACTIVE_LIQUIDATION_DAYS, JSC_MAX_SHARES, STOCK_TRADE_FEE, FEATURE_LEVELS } from "@egeopolis/game-core";
import { PrismaService, type Tx } from "../prisma/prisma.service";
import { GameService } from "../game/game.service";
import { RedisService } from "../redis/redis.service";

const GOLD = (g: number) => BigInt(Math.round(g * 100));

@Injectable()
export class StocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Create a Joint-Stock Company from scratch: 100g (wiki) — 50g fee, 50g into
   * company treasury. Creator becomes CEO holding the full initial issue.
   */
  async create(citizenId: string, name: string, sharesTotal: number) {
    if (!name?.trim() || name.length < 3) throw new BadRequestException("company name too short");
    const shares = Math.max(1, Math.min(JSC_MAX_SHARES, Math.floor(sharesTotal || 1000)));
    const citizen = await this.prisma.citizen.findUniqueOrThrow({ where: { id: citizenId } });
    if (citizen.level < FEATURE_LEVELS.CREATE_STOCK_COMPANY) {
      throw new ForbiddenException(`level ${FEATURE_LEVELS.CREATE_STOCK_COMPANY} required`);
    }
    return this.redis.withLock(`gold:${citizenId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        // Creator pays the full 100g: 50g fee (burned) + 50g seeded into the company treasury.
        await this.game.moveGold(tx, { type: "CITIZEN", id: citizenId }, null, GOLD(JSC_CREATE_COST), "JSC_CREATE");
        const jsc = await tx.stockCompany.create({
          data: { name: name.trim(), ceoId: citizenId, sharesTotal: shares, treasuryGold: GOLD(JSC_CREATE_COST * JSC_FEE_SHARE) },
        });
        await tx.transaction.create({
          data: {
            asset: "GOLD",
            reason: "JSC_CREATE",
            amount: GOLD(JSC_CREATE_COST * JSC_FEE_SHARE),
            toType: "STOCK_COMPANY",
            toId: jsc.id,
            meta: { kind: "TREASURY_SEED", jsc: jsc.name } as Prisma.InputJsonValue,
          },
        });
        await tx.share.create({ data: { jscId: jsc.id, holderCitizenId: citizenId, quantity: shares } });
        return jsc;
      }),
    );
  }

  mine(citizenId: string) {
    return this.prisma.share.findMany({
      where: { holderCitizenId: citizenId, quantity: { gt: 0 } },
      include: {
        jsc: {
          select: { id: true, name: true, sharesTotal: true, treasuryGold: true, issuePrice: true, ceoId: true },
        },
      },
    });
  }

  /** All JSCs — stock-exchange browser. */
  list() {
    return this.prisma.stockCompany.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        ceo: { select: { nickname: true } },
        _count: { select: { shares: { where: { quantity: { gt: 0 } } } } },
      },
    });
  }

  async detail(jscId: string) {
    const jsc = await this.prisma.stockCompany.findUnique({
      where: { id: jscId },
      include: {
        shares: { where: { quantity: { gt: 0 } }, include: { holder: { select: { id: true, nickname: true } } } },
        orders: { where: { active: true }, orderBy: [{ price: "asc" }, { createdAt: "asc" }] },
        dividends: { orderBy: { createdAt: "desc" }, take: 10 },
        polls: { orderBy: { closesAt: "desc" }, take: 10 },
      },
    });
    if (!jsc) throw new NotFoundException("stock company not found");
    // Recent trades across this company's orders.
    const trades = await this.prisma.stockTrade.findMany({
      where: { order: { jscId } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return { ...jsc, trades };
  }

  /**
   * CEO issues additional shares and buys them at the issue price — the company
   * treasury receives quantity × issuePrice (wiki: issuing shares raises capital).
   * Cap: 1,000,000 total shares.
   */
  async issueShares(citizenId: string, jscId: string, quantity: number) {
    if (quantity <= 0) throw new BadRequestException("quantity must be positive");
    return this.redis.withLock(`jsc:${jscId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const jsc = await this.ceoOf(tx, citizenId, jscId);
        const newTotal = jsc.sharesTotal + quantity;
        if (newTotal > JSC_MAX_SHARES) throw new BadRequestException(`share cap is ${JSC_MAX_SHARES}`);
        const cost = jsc.issuePrice * BigInt(quantity);
        await this.game.moveGold(tx, { type: "CITIZEN", id: citizenId }, null, cost, "JSC_SHARE_ISSUE", { jsc: jsc.name, quantity });
        await tx.stockCompany.update({ where: { id: jscId }, data: { sharesTotal: newTotal, treasuryGold: { increment: cost } } });
        await tx.share.upsert({
          where: { jscId_holderCitizenId: { jscId, holderCitizenId: citizenId } },
          create: { jscId, holderCitizenId: citizenId, quantity },
          update: { quantity: { increment: quantity } },
        });
        await this.game.notify(tx, citizenId, "SHARES_ISSUED", { jsc: jsc.name, quantity });
        return { ok: true, sharesTotal: newTotal, treasuryGold: jsc.treasuryGold + cost };
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Stock order book (limit orders, price in gold per share)
  // ---------------------------------------------------------------------------

  async createOrder(
    citizenId: string,
    jscId: string,
    side: "SELL" | "BUY",
    quantity: number,
    pricePerShareGold: number,
  ) {
    if (quantity <= 0 || pricePerShareGold <= 0) throw new BadRequestException("quantity/price must be positive");
    return this.redis.withLock(`jsc:${jscId}`, 10000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const escrowed = await this.escrow(tx, citizenId, jscId, side, quantity, GOLD(pricePerShareGold));
        const order = await tx.stockOrder.create({
          data: {
            jscId,
            ownerId: citizenId,
            side,
            quantity,
            price: GOLD(pricePerShareGold),
            remaining: quantity,
          },
        });
        await this.matchOrders(tx, jscId, order.id, escrowed);
        return tx.stockOrder.findUniqueOrThrow({ where: { id: order.id } });
      }),
    );
  }

  /** 1% buy-fee reserve for the given gold amount (integer cents, floored). */
  private feeOf(goldCents: bigint): bigint {
    return (goldCents * BigInt(Math.round(STOCK_TRADE_FEE * 100))) / BigInt(100);
  }

  private async escrow(
    tx: Tx,
    citizenId: string,
    jscId: string,
    side: "SELL" | "BUY",
    quantity: number,
    priceCents: bigint,
  ): Promise<void> {
    if (side === "SELL") {
      const res = await tx.share.updateMany({
        where: { jscId, holderCitizenId: citizenId, quantity: { gte: quantity } },
        data: { quantity: { decrement: quantity } },
      });
      if (res.count === 0) throw new BadRequestException("not enough shares to sell");
    } else {
      // Buyers escrow the full amount plus the 1% trade-fee reserve (wiki: fee on share buys).
      const total = priceCents * BigInt(quantity);
      await this.game.moveGold(tx, { type: "CITIZEN", id: citizenId }, null, total + this.feeOf(total), "OTHER");
    }
  }

  /** Naive counter-side matching against best prices (price-time priority). */
  private async matchOrders(tx: Tx, jscId: string, incomingId: string, _escrowed: void) {
    const incoming = await tx.stockOrder.findUniqueOrThrow({ where: { id: incomingId } });
    const opposite = incoming.side === "BUY" ? "SELL" : "BUY";

    for (;;) {
      const self = await tx.stockOrder.findUniqueOrThrow({ where: { id: incomingId } });
      if (self.remaining <= 0 || !self.active) break;

      const candidates = await tx.stockOrder.findMany({
        where: {
          jscId,
          side: opposite,
          active: true,
          remaining: { gt: 0 },
          ownerId: { not: citizenOwnedBy(self.ownerId) },
        },
        orderBy: [{ price: opposite === "SELL" ? "asc" : "desc" }, { createdAt: "asc" }],
        take: 25,
      });
      const match = candidates.find((c) =>
        incoming.side === "BUY" ? c.price <= self.price : c.price >= self.price,
      );
      if (!match) break;

      const qty = Math.min(self.remaining, match.remaining);
      const price = match.price; // maker's price wins
      const buyerId = incoming.side === "BUY" ? self.ownerId : match.ownerId;
      const sellerId = incoming.side === "SELL" ? self.ownerId : match.ownerId;

      // Shares transfer: buyer Share upsert; seller had escrowed shares.
      await tx.share.upsert({
        where: { jscId_holderCitizenId: { jscId, holderCitizenId: buyerId } },
        create: { jscId, holderCitizenId: buyerId, quantity: qty },
        update: { quantity: { increment: qty } },
      });

      // Gold transfer between escrows. Fee: 1% of the trade, paid from the buyer's escrow reserve.
      const gold = price * BigInt(qty);
      const fee = this.feeOf(gold);
      // Both book sides always decrement; orders close at zero remaining.
      await tx.stockOrder.update({ where: { id: self.id }, data: { remaining: { decrement: qty }, active: self.remaining - qty <= 0 ? false : true } });
      await tx.stockOrder.update({ where: { id: match.id }, data: { remaining: { decrement: qty }, active: match.remaining - qty <= 0 ? false : true } });
      if (incoming.side === "BUY") {
        // Buyer escrowed limit price + fee reserve; pay maker's price + actual fee, refund the rest.
        const escrowed = self.price * BigInt(qty);
        const refund = escrowed + this.feeOf(escrowed) - gold - fee;
        if (refund > 0n) {
          await this.game.moveGold(tx, null, { type: "CITIZEN", id: buyerId }, refund, "OTHER");
        }
        await this.game.moveGold(tx, null, { type: "CITIZEN", id: sellerId }, gold, "STOCK_TRADE");
      } else {
        // Buyer (maker) escrowed exactly maker price + matching fee reserve — nothing to refund.
        await this.game.moveGold(tx, null, { type: "CITIZEN", id: sellerId }, gold, "STOCK_TRADE");
      }
      if (fee > 0n) {
        await tx.transaction.create({
          data: { asset: "GOLD", reason: "STOCK_TRADE_FEE", amount: -fee, fromType: "CITIZEN", fromId: buyerId, meta: { jscId, qty } as Prisma.InputJsonValue },
        });
      }

      await tx.stockTrade.create({
        data: {
          orderId: incoming.side === "BUY" ? self.id : match.id,
          buyerId,
          sellerId,
          quantity: qty,
          price: gold,
        },
      });
    }
    void citizenOwnedBy;
  }

  async cancelOrder(citizenId: string, orderId: string) {
    return this.redis.withLock(`order:${orderId}`, 6000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const order = await tx.stockOrder.findUnique({ where: { id: orderId } });
        if (!order || order.ownerId !== citizenId || !order.active) throw new ConflictException("order not cancellable");
        await tx.stockOrder.update({ where: { id: orderId }, data: { active: false } });
        if (order.side === "SELL") {
          await tx.share.upsert({
            where: { jscId_holderCitizenId: { jscId: order.jscId, holderCitizenId: citizenId } },
            create: { jscId: order.jscId, holderCitizenId: citizenId, quantity: order.remaining },
            update: { quantity: { increment: order.remaining } },
          });
        } else {
          // Refund the escrowed gold plus the unused 1% fee reserve.
          const gold = order.price * BigInt(order.remaining);
          await this.game.moveGold(tx, null, { type: "CITIZEN", id: citizenId }, gold + this.feeOf(gold), "OTHER");
        }
        return { ok: true };
      }),
    );
  }

  /**
   * Dividends: CEO pays X gold from company treasury; every share receives
   * floor(X / sharesTotal); holders credited proportionally (wiki: Stock company).
   */
  async payDividends(citizenId: string, jscId: string, totalGold: number) {
    const total = GOLD(totalGold);
    if (total <= 0n) throw new BadRequestException("dividend must be positive");
    return this.redis.withLock(`dividend:${jscId}`, 10000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const jsc = await this.ceoOf(tx, citizenId, jscId);
        if (jsc.treasuryGold < total) throw new BadRequestException("not enough gold in company treasury");

        const perShare = total / BigInt(jsc.sharesTotal);
        if (perShare <= 0n) throw new BadRequestException("too many shares for this dividend amount");

        await tx.stockCompany.update({ where: { id: jscId }, data: { treasuryGold: { decrement: perShare * BigInt(jsc.sharesTotal) } } });
        const shares = await tx.share.findMany({ where: { jscId, quantity: { gt: 0 } } });
        for (const s of shares) {
          const payout = perShare * BigInt(s.quantity);
          if (payout > 0n) {
            await tx.citizen.update({ where: { id: s.holderCitizenId }, data: { gold: { increment: payout } } });
            await tx.transaction.create({
              data: { asset: "GOLD", reason: "JSC_DIVIDEND", amount: payout, toType: "CITIZEN", toId: s.holderCitizenId, meta: { jsc: jsc.name } as Prisma.InputJsonValue },
            });
          }
        }
        await tx.dividend.create({ data: { jscId, totalGold: perShare * BigInt(jsc.sharesTotal), perShare } });
        return { ok: true, perShare: Number(perShare) / 100 };
      }),
    );
  }

  /** Citizens may donate gold directly into a company's treasury (wiki: donate to JSC). */
  async donate(citizenId: string, jscId: string, totalGold: number) {
    const amount = GOLD(totalGold);
    if (amount <= 0n) throw new BadRequestException("donation must be positive");
    return this.redis.withLock(`jsc:${jscId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const jsc = await tx.stockCompany.findUnique({ where: { id: jscId } });
        if (!jsc) throw new NotFoundException("stock company not found");
        await this.game.moveGold(tx, { type: "CITIZEN", id: citizenId }, null, amount, "JSC_DONATION", { jsc: jsc.name });
        await tx.stockCompany.update({ where: { id: jscId }, data: { treasuryGold: { increment: amount } } });
        return { ok: true, treasuryGold: jsc.treasuryGold + amount };
      }),
    );
  }

  private async ceoOf(tx: Tx, citizenId: string, jscId: string) {
    const jsc = await tx.stockCompany.findUnique({ where: { id: jscId } });
    if (!jsc) throw new NotFoundException("stock company not found");
    if (jsc.ceoId !== citizenId) throw new ForbiddenException("CEO only");
    return jsc;
  }

  // ---------------------------------------------------------------------------
  // CEO Voting Engine — polls (issue shares / dividends / set price / impeach CEO)
  // Votes weighted by shares held; > 50% of all shares required to pass.
  // ---------------------------------------------------------------------------

  async proposePoll(citizenId: string, jscId: string, dto: { kind: string; payload: Record<string, unknown> }) {
    const validKinds = ["ISSUE_SHARES", "DIVIDENDS", "SET_PRICE", "IMPEACH_CEO"];
    if (!validKinds.includes(dto.kind)) throw new BadRequestException(`kind must be one of ${validKinds.join(", ")}`);
    return this.redis.withLock(`jsc:${jscId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const jsc = await tx.stockCompany.findUnique({ where: { id: jscId } });
        if (!jsc) throw new NotFoundException("stock company not found");
        if (dto.kind === "IMPEACH_CEO") {
          // Takeover: any shareholder may move to replace the CEO (the CEO cannot propose their own impeachment).
          if (jsc.ceoId === citizenId) throw new ForbiddenException("the CEO cannot propose their own impeachment");
          const holdings = await tx.share.findUnique({ where: { jscId_holderCitizenId: { jscId, holderCitizenId: citizenId } } });
          if (!holdings || holdings.quantity <= 0) throw new ForbiddenException("shareholders only");
          // The candidate defaults to the proposer (takeover bid).
          if (!dto.payload.candidateId) dto.payload = { ...dto.payload, candidateId: citizenId };
        } else {
          await this.ceoOf(tx, citizenId, jscId);
        }
        // one open poll per kind at a time
        const open = await tx.jscPoll.findFirst({ where: { jscId, kind: dto.kind, status: "VOTING" } });
        if (open) throw new ConflictException("a poll of this kind is already voting");
        return tx.jscPoll.create({
          data: {
            jscId,
            kind: dto.kind,
            payload: dto.payload as Prisma.InputJsonValue,
            closesAt: new Date(Date.now() + 48 * 3600_000),
          },
        });
      }),
    );
  }

  /** Shareholders vote with weight = shares held. Re-voting updates the choice. */
  async votePoll(citizenId: string, pollId: string, yes: boolean) {
    return this.redis.withLock(`poll:${pollId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const poll = await tx.jscPoll.findUniqueOrThrow({ where: { id: pollId } });
        if (poll.status !== "VOTING" || new Date(poll.closesAt) < new Date()) throw new ConflictException("voting closed");
        const share = await tx.share.findUnique({
          where: { jscId_holderCitizenId: { jscId: poll.jscId, holderCitizenId: citizenId } },
        });
        const weight = share?.quantity ?? 0;
        if (weight <= 0) throw new ForbiddenException("shareholders only");

        const existing = await tx.jscPollVote.findUnique({
          where: { pollId_citizenId: { pollId, citizenId } },
        });
        if (existing) {
          const delta = BigInt(Math.min(weight, existing.weight)); // re-weight if holdings changed
          if (existing.yes !== yes) {
            await tx.jscPoll.update({
              where: { id: pollId },
              data: yes
                ? { yesWeight: { increment: BigInt(weight) }, noWeight: { decrement: delta } }
                : { noWeight: { increment: BigInt(weight) }, yesWeight: { decrement: delta } },
            });
          }
          await tx.jscPollVote.update({ where: { id: existing.id }, data: { yes, weight } });
        } else {
          await tx.jscPollVote.create({ data: { pollId, citizenId, yes, weight } });
          await tx.jscPoll.update({
            where: { id: pollId },
            data: yes ? { yesWeight: { increment: BigInt(weight) } } : { noWeight: { increment: BigInt(weight) } },
          });
        }
        return { ok: true, weight };
      }),
    );
  }

  /** Settle closed polls; execute passed ones (called by the battle-sweep). */
  async sweepPolls() {
    const closed = await this.prisma.jscPoll.findMany({
      where: { status: "VOTING", closesAt: { lt: new Date() } },
      include: { jsc: true },
      take: 25,
    });
    let executed = 0;
    for (const poll of closed) {
      const totalShares = poll.jsc.sharesTotal;
      const passed = poll.yesWeight * BigInt(2) > BigInt(totalShares); // > 50%
      await this.prisma.$transaction(async (tx: Tx) => {
        if (!passed) {
          await tx.jscPoll.update({ where: { id: poll.id }, data: { status: "REJECTED", executed: true } });
          return;
        }
        const payload = poll.payload as Record<string, unknown>;
        switch (poll.kind) {
          case "ISSUE_SHARES": {
            const qty = Math.max(1, Math.floor(Number(payload.quantity) || 0));
            const newTotal = poll.jsc.sharesTotal + qty;
            const cost = poll.jsc.issuePrice * BigInt(qty);
            const ceo = await tx.citizen.findUniqueOrThrow({ where: { id: poll.jsc.ceoId }, select: { gold: true } });
            if (newTotal <= JSC_MAX_SHARES && ceo.gold >= cost) {
              // Issued shares are bought by the CEO at the issue price; proceeds go to the company treasury.
              await this.game.moveGold(tx, { type: "CITIZEN", id: poll.jsc.ceoId }, null, cost, "JSC_SHARE_ISSUE", { jsc: poll.jsc.name, quantity: qty });
              await tx.stockCompany.update({ where: { id: poll.jscId }, data: { sharesTotal: newTotal, treasuryGold: { increment: cost } } });
              await tx.share.upsert({
                where: { jscId_holderCitizenId: { jscId: poll.jscId, holderCitizenId: poll.jsc.ceoId } },
                create: { jscId: poll.jscId, holderCitizenId: poll.jsc.ceoId, quantity: qty },
                update: { quantity: { increment: qty } },
              });
            }
            break;
          }
          case "DIVIDENDS": {
            const total = GOLD(Number(payload.totalGold) || 0);
            const jsc = poll.jsc;
            if (total > 0n && jsc.treasuryGold >= total) {
              const perShare = total / BigInt(jsc.sharesTotal);
              if (perShare > 0n) {
                await tx.stockCompany.update({ where: { id: jsc.id }, data: { treasuryGold: { decrement: perShare * BigInt(jsc.sharesTotal) } } });
                const shares = await tx.share.findMany({ where: { jscId: jsc.id, quantity: { gt: 0 } } });
                for (const s of shares) {
                  const payout = perShare * BigInt(s.quantity);
                  if (payout > 0n) {
                    await tx.citizen.update({ where: { id: s.holderCitizenId }, data: { gold: { increment: payout } } });
                    await tx.transaction.create({
                      data: { asset: "GOLD", reason: "JSC_DIVIDEND", amount: payout, toType: "CITIZEN", toId: s.holderCitizenId, meta: { jsc: jsc.name, poll: poll.id } as Prisma.InputJsonValue },
                    });
                  }
                }
                await tx.dividend.create({ data: { jscId: jsc.id, totalGold: perShare * BigInt(jsc.sharesTotal), perShare } });
              }
            }
            break;
          }
          case "SET_PRICE": {
            const price = GOLD(Number(payload.priceGold) || 0);
            if (price > 0n) {
              await tx.stockCompany.update({ where: { id: poll.jscId }, data: { issuePrice: price } });
            }
            break;
          }
          case "IMPEACH_CEO": {
            const candidateId = String(payload.candidateId ?? "");
            if (candidateId) {
              const hasShares = await tx.share.findFirst({ where: { jscId: poll.jscId, holderCitizenId: candidateId, quantity: { gt: 0 } } });
              if (hasShares) {
                await tx.stockCompany.update({ where: { id: poll.jscId }, data: { ceoId: candidateId } });
              }
            }
            break;
          }
        }
        await tx.jscPoll.update({ where: { id: poll.id }, data: { status: "PASSED", executed: true } });
      });
      if (passed) executed++;
    }
    return { settled: closed.length, executed };
  }

  /**
   * Liquidate JSCs inactive for 30+ days (wiki: JSC_INACTIVE_LIQUIDATION_DAYS):
   * no trades, orders, polls or dividends in the window and no open order escrows.
   * Treasury is paid out pro-rata to current shareholders, then the company is deleted.
   */
  async liquidateInactive() {
    const cutoff = new Date(Date.now() - JSC_INACTIVE_LIQUIDATION_DAYS * 86_400_000);
    const stale = await this.prisma.stockCompany.findMany({
      where: { createdAt: { lt: cutoff } },
      include: {
        shares: { where: { quantity: { gt: 0 } } },
        orders: { select: { createdAt: true, active: true } },
        dividends: { select: { createdAt: true } },
        polls: { select: { closesAt: true } },
      },
      take: 10,
    });
    let liquidated = 0;
    for (const jsc of stale) {
      const lastActivity = Math.max(
        jsc.createdAt.getTime(),
        ...jsc.orders.map((o) => o.createdAt.getTime()),
        ...jsc.dividends.map((d) => d.createdAt.getTime()),
        ...jsc.polls.map((p) => p.closesAt.getTime()),
      );
      const lastTrade = await this.prisma.stockTrade.findFirst({ where: { order: { jscId: jsc.id } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
      if ((lastTrade?.createdAt.getTime() ?? 0) > lastActivity) continue;
      if (lastActivity >= cutoff.getTime()) continue;
      if (jsc.orders.some((o) => o.active)) continue; // open escrows — cannot settle yet

      await this.prisma.$transaction(async (tx: Tx) => {
        const shares = await tx.share.findMany({ where: { jscId: jsc.id, quantity: { gt: 0 } } });
        const held = shares.reduce((sum, s) => sum + s.quantity, 0);
        if (held > 0 && jsc.treasuryGold > 0n) {
          const perShare = jsc.treasuryGold / BigInt(held);
          if (perShare > 0n) {
            for (const s of shares) {
              const payout = perShare * BigInt(s.quantity);
              await tx.citizen.update({ where: { id: s.holderCitizenId }, data: { gold: { increment: payout } } });
              await tx.transaction.create({
                data: { asset: "GOLD", reason: "JSC_LIQUIDATION", amount: payout, toType: "CITIZEN", toId: s.holderCitizenId, meta: { jsc: jsc.name } as Prisma.InputJsonValue },
              });
            }
          }
        }
        for (const s of shares) {
          await this.game.notify(tx, s.holderCitizenId, "JSC_LIQUIDATED", { jsc: jsc.name });
        }
        await tx.stockTrade.deleteMany({ where: { order: { jscId: jsc.id } } });
        await tx.stockOrder.deleteMany({ where: { jscId: jsc.id } });
        await tx.jscPoll.deleteMany({ where: { jscId: jsc.id } }); // votes cascade
        await tx.dividend.deleteMany({ where: { jscId: jsc.id } });
        await tx.share.deleteMany({ where: { jscId: jsc.id } });
        await tx.stockCompany.delete({ where: { id: jsc.id } });
      });
      liquidated++;
    }
    return { liquidated };
  }
}

function citizenOwnedBy(ownerId: string) {
  return ownerId;
}

import type { Prisma } from "@prisma/client";
