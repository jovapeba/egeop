import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  CONTRACT_MAX_DURATION_DAYS,
  CONTRACT_MAX_INTEREST_PCT,
  CONTRACT_MIN_DURATION_DAYS,
} from "@egeopolis/game-core";
import { PrismaService, type Tx } from "../prisma/prisma.service";
import { GameService } from "../game/game.service";
import { RedisService } from "../redis/redis.service";

const GOLD = (g: number) => BigInt(Math.round(g * 100));

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService,
    private readonly redis: RedisService,
  ) {}

  list(status?: string) {
    return this.prisma.contract.findMany({
      where: status ? { status: status as never } : { status: "OPEN" },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  /** Public audit feed: "X and Y had a transaction" (no amounts). */
  async auditLog(take = 30) {
    const txs = await this.prisma.transaction.findMany({
      where: { asset: "GOLD", reason: { in: ["LAW_EXECUTION", "TREASURY_TRANSFER", "OTHER"] } },
      orderBy: { createdAt: "desc" },
      take: take * 4,
    });
    const audit = [];
    for (const t of txs) {
      if (t.fromType === "CITIZEN" && t.toType === "CITIZEN") {
        const [a, b] = await Promise.all([
          this.prisma.citizen.findUnique({ where: { id: t.fromId! }, select: { nickname: true } }),
          this.prisma.citizen.findUnique({ where: { id: t.toId! }, select: { nickname: true } }),
        ]);
        if (a && b) audit.push({ id: t.id, note: `${a.nickname} and ${b.nickname} had a transaction`, at: t.createdAt });
      }
      if (audit.length >= take) break;
    }
    return audit;
  }

  /**
   * Money loan: creator offers X gold for N days at i% interest.
   * Total due auto-calculated: amount + amount×i%.
   */
  async createLoan(citizenId: string, dto: { amountGold: number; durationDays: number; interestPct: number }) {
    const amount = GOLD(dto.amountGold);
    const days = Math.max(CONTRACT_MIN_DURATION_DAYS, Math.min(CONTRACT_MAX_DURATION_DAYS, Math.floor(dto.durationDays || 1)));
    const interest = Math.max(0, Math.min(CONTRACT_MAX_INTEREST_PCT, Math.round(dto.interestPct || 0)));
    const totalDue = amount + (amount * BigInt(interest)) / BigInt(100);
    // Creator must escrow the loaned amount immediately.
    return this.redis.withLock(`gold:${citizenId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        await this.game.moveGold(tx, { type: "CITIZEN", id: citizenId }, null, amount, "OTHER", { loanEscrow: true });
        return tx.contract.create({
          data: {
            type: "LOAN",
            creatorId: citizenId,
            amountGold: amount,
            durationDays: days,
            interestPct: interest,
            totalDueGold: totalDue,
          },
        });
      }),
    );
  }

  /** Pack sale (gold packs for gold): counterparty buys from creator's escrow. */
  async createPackSale(citizenId: string, dto: { amountGold: number; priceGold: number }) {
    if (dto.amountGold <= 0 || dto.priceGold <= 0) throw new BadRequestException("amounts must be positive");
    const amount = GOLD(dto.amountGold);
    return this.redis.withLock(`gold:${citizenId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        await this.game.moveGold(tx, { type: "CITIZEN", id: citizenId }, null, amount, "OTHER", { packEscrow: true });
        return tx.contract.create({
          data: {
            type: "PACK_SALE",
            creatorId: citizenId,
            amountGold: amount,
            totalDueGold: GOLD(dto.priceGold),
            durationDays: CONTRACT_MIN_DURATION_DAYS,
          },
        });
      }),
    );
  }

  /** Accept an open contract as the counterparty. */
  async accept(citizenId: string, contractId: string) {
    return this.redis.withLock(`contract:${contractId}`, 10000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const contract = await tx.contract.findUniqueOrThrow({ where: { id: contractId } });
        if (contract.status !== "OPEN") throw new ConflictException("contract not open");
        if (contract.creatorId === citizenId) throw new BadRequestException("cannot accept your own contract");

        if (contract.type === "LOAN") {
          // Borrower receives the escrowed amount now; owes total due later.
          await this.game.moveGold(tx, null, { type: "CITIZEN", id: citizenId }, contract.amountGold, "OTHER");
          await this.game.notify(tx, contract.creatorId, "LOAN_ACCEPTED", { contractId, borrower: citizenId });
        }
        if (contract.type === "PACK_SALE") {
          // Buyer pays the pack price; creator receives it; buyer receives the pack gold.
          await this.game.moveGold(tx, { type: "CITIZEN", id: citizenId }, { type: "CITIZEN", id: contract.creatorId }, contract.totalDueGold, "LAW_EXECUTION");
          await this.game.moveGold(tx, null, { type: "CITIZEN", id: citizenId }, contract.amountGold, "OTHER");
        }
        return tx.contract.update({
          where: { id: contractId },
          data: {
            status: contract.type === "LOAN" ? "ACCEPTED" : "COMPLETED",
            counterpartyId: citizenId,
            auditNote: `contract ${contractId} ${contract.type === "LOAN" ? "accepted" : "completed"}`,
            completedAt: contract.type === "LOAN" ? null : new Date(),
          },
        });
      }),
    );
  }

  /** Repay a loan (borrower pays total due; lender receives it). */
  async repay(citizenId: string, contractId: string) {
    return this.redis.withLock(`contract:${contractId}`, 10000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const contract = await tx.contract.findUniqueOrThrow({ where: { id: contractId } });
        if (contract.type !== "LOAN" || contract.counterpartyId !== citizenId) {
          throw new ForbiddenException("borrower only");
        }
        if (contract.status === "COMPLETED") throw new ConflictException("already repaid");
        await this.game.moveGold(
          tx,
          { type: "CITIZEN", id: citizenId },
          { type: "CITIZEN", id: contract.creatorId },
          contract.totalDueGold,
          "OTHER",
          { loanRepayment: contractId },
        );
        return tx.contract.update({ where: { id: contractId }, data: { status: "COMPLETED", completedAt: new Date() } });
      }),
    );
  }

  /** Staff-only: cancel a debt (release escrow back to creator). */
  async staffCancel(staffId: string, contractId: string) {
    const staff = await this.prisma.citizen.findUniqueOrThrow({ where: { id: staffId }, select: { isAdmin: true } });
    if (!staff.isAdmin) throw new ForbiddenException("staff only");
    return this.redis.withLock(`contract:${contractId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const contract = await tx.contract.findUniqueOrThrow({ where: { id: contractId } });
        if (contract.status !== "OPEN" && contract.status !== "ACCEPTED") throw new ConflictException("not cancellable");
        await this.game.moveGold(tx, null, { type: "CITIZEN", id: contract.creatorId }, contract.amountGold, "OTHER", { debtCancel: contractId });
        return tx.contract.update({ where: { id: contractId }, data: { status: "CANCELLED", completedAt: new Date() } });
      }),
    );
  }
}
