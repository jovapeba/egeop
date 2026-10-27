import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/** Statistics engine: 6 categories × daily/monthly/all-time damage counters. */
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  async countryLeaderboard(take = 10) {
    const rows = await this.prisma.battleHit.groupBy({
      by: ["citizenId"],
      _sum: { damage: true },
      orderBy: { _sum: { damage: "desc" } },
      take: take * 5,
    });
    const citizens = await this.prisma.citizen.findMany({
      where: { id: { in: rows.map((r) => r.citizenId) } },
      select: { id: true, citizenshipCountryId: true },
    });
    const byCountry = new Map<string, bigint>();
    const citById = new Map(citizens.map((c) => [c.id, c]));
    for (const r of rows) {
      const c = citById.get(r.citizenId);
      if (!c) continue;
      byCountry.set(c.citizenshipCountryId, (byCountry.get(c.citizenshipCountryId) ?? 0n) + (r._sum.damage ?? 0n));
    }
    const countries = await this.prisma.country.findMany({
      where: { id: { in: [...byCountry.keys()] } },
      select: { id: true, name: true, code: true, flagColor: true },
    });
    return countries
      .map((c) => ({ ...c, damage: byCountry.get(c.id) ?? 0n }))
      .sort((a, b) => Number(b.damage) - Number(a.damage))
      .slice(0, take);
  }

  async armyLeaderboard(take = 10) {
    return this.prisma.militaryUnit.findMany({
      orderBy: { gold: "desc" },
      take,
      include: { _count: { select: { members: true } } },
    });
  }

  async citizenLeaderboard(take = 20) {
    return this.prisma.citizen.findMany({
      orderBy: { totalDamage: "desc" },
      take,
      select: {
        id: true, nickname: true, level: true, totalDamage: true,
        citizenshipCountry: { select: { name: true, code: true, flagColor: true } },
      },
    });
  }

  async dailyRollup(day: number) {
    const rows = await this.prisma.statsRollup.findMany({
      where: { day },
      orderBy: { damage: "desc" },
      take: 50,
    });
    // Resolve owner names in batched queries (no N+1).
    const ids = (t: string) => rows.filter((r) => r.ownerType === t).map((r) => r.ownerId);
    const [countries, citizens, alliances, jscs] = await Promise.all([
      this.prisma.country.findMany({ where: { id: { in: ids("COUNTRY") } }, select: { id: true, name: true, code: true, flagColor: true } }),
      this.prisma.citizen.findMany({ where: { id: { in: ids("CITIZEN") } }, select: { id: true, nickname: true } }),
      this.prisma.alliance.findMany({ where: { id: { in: ids("ALLIANCE") } }, select: { id: true, name: true } }),
      this.prisma.stockCompany.findMany({ where: { id: { in: ids("JSC") } }, select: { id: true, name: true } }),
    ]);
    const nameOf = new Map<string, string>([
      ...countries.map((c) => [c.id, c.name] as const),
      ...citizens.map((c) => [c.id, c.nickname] as const),
      ...alliances.map((a) => [a.id, a.name] as const),
      ...jscs.map((j) => [j.id, j.name] as const),
    ]);
    return rows.map((r) => ({ ...r, name: nameOf.get(r.ownerId) ?? r.ownerId }));
  }
}
