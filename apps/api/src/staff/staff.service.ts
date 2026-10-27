import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { JSC_INACTIVE_LIQUIDATION_DAYS } from "@egeopolis/game-core";
import { PrismaService } from "../prisma/prisma.service";

export const STAFF_RANKS = ["POLICE_OFFICER", "INSPECTOR", "SPECIAL_AGENT", "DIRECTOR"] as const;

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  /** Moderation deck overview (admin-only): shared-IP audit, open debts, inactive shares. */
  async overview() {
    const [sharedIp, openDebts, inactiveShares, recentTransactions, counts] = await Promise.all([
      this.sharedIpTable(),
      this.prisma.contract.findMany({
        where: { status: { in: ["OPEN", "ACCEPTED"] }, type: "LOAN" },
        orderBy: { createdAt: "desc" },
        take: 25,
        include: {
          creator: { select: { id: true, nickname: true } },
          counterparty: { select: { id: true, nickname: true } },
        },
      }),
      this.liquidatableShares(),
      this.recentTransactions(),
      Promise.all([
        this.prisma.citizen.count(),
        this.prisma.country.count(),
        this.prisma.contract.count({ where: { status: "COMPLETED" } }),
      ]),
    ]);
    return {
      staffRanks: STAFF_RANKS,
      sharedIp,
      openDebts,
      inactiveShares,
      recentTransactions,
      totals: { citizens: counts[0], countries: counts[1], completedContracts: counts[2] },
      liquidationDays: JSC_INACTIVE_LIQUIDATION_DAYS,
    };
  }

  /** Public shared-IP audit table: accounts sharing a login IP (≥ 2 accounts). */
  private async sharedIpTable() {
    const rows = await this.prisma.citizen.groupBy({
      by: ["lastIp"],
      where: { lastIp: { not: null } },
      _count: { lastIp: true },
      having: { lastIp: { _count: { gte: 2 } } },
    });
    const flagged = rows.map((r) => r.lastIp as string);
    const citizens = await this.prisma.citizen.findMany({
      where: { lastIp: { in: flagged } },
      select: {
        id: true,
        nickname: true,
        lastIp: true,
        level: true,
        citizenshipCountry: { select: { name: true, code: true } },
      },
      orderBy: { lastIp: "asc" },
    });
    const byIp = new Map<string, typeof citizens>();
    for (const c of citizens) {
      (byIp.get(c.lastIp as string) ?? byIp.set(c.lastIp as string, []).get(c.lastIp as string)!).push(c);
    }
    return [...byIp.entries()].map(([ip, accounts]) => ({ ip, accounts }));
  }

  /** Shares of citizens inactive for 30+ days — liquidatable by Staff (§2.4/§7.3). */
  private async liquidatableShares() {
    const cutoff = new Date(Date.now() - JSC_INACTIVE_LIQUIDATION_DAYS * 86_400_000);
    const stale = await this.prisma.share.findMany({
      where: { quantity: { gt: 0 }, holder: { lastSeenAt: { lt: cutoff }, isBot: false } },
      include: {
        holder: { select: { id: true, nickname: true, lastSeenAt: true } },
        jsc: { select: { name: true } },
      },
      take: 25,
    });
    return stale.map((s) => ({
      shareId: s.id,
      jsc: s.jsc.name,
      holder: s.holder.nickname,
      quantity: s.quantity,
      lastSeen: s.holder.lastSeenAt,
    }));
  }

  /** Audit-note feed for the deck (no amounts). */
  private async recentTransactions() {
    const txs = await this.prisma.transaction.findMany({
      where: { asset: "GOLD", reason: { in: ["LAW_EXECUTION", "TREASURY_TRANSFER", "OTHER"] } },
      orderBy: { createdAt: "desc" },
      take: 60,
    });
    const audit: Array<{ id: string; note: string; at: Date }> = [];
    for (const t of txs) {
      if (t.fromType === "CITIZEN" && t.toType === "CITIZEN") {
        const [a, b] = await Promise.all([
          this.prisma.citizen.findUnique({ where: { id: t.fromId! }, select: { nickname: true } }),
          this.prisma.citizen.findUnique({ where: { id: t.toId! }, select: { nickname: true } }),
        ]);
        if (a && b) audit.push({ id: t.id, note: `${a.nickname} and ${b.nickname} had a transaction`, at: t.createdAt });
      }
      if (audit.length >= 15) break;
    }
    return audit;
  }

  async citizenIpAudit(citizenId: string) {
    const c = await this.prisma.citizen.findUnique({
      where: { id: citizenId },
      select: { id: true, nickname: true, lastIp: true, level: true, createdAt: true, citizenshipCountry: { select: { name: true } } },
    });
    if (!c) throw new NotFoundException("citizen not found");
    return c;
  }

  assertAdmin(citizen: { isAdmin: boolean }) {
    if (!citizen.isAdmin) throw new ForbiddenException("staff only");
  }
}
