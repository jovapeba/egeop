import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { TOURNAMENT_CFG, HP_HIT_COST } from "@egeopolis/game-core";
import { Prisma } from "@prisma/client";
import { PrismaService, type Tx } from "../prisma/prisma.service";
import { GameService } from "../game/game.service";
import { RedisService } from "../redis/redis.service";
import { EquipmentService } from "../equipment/equipment.service";

const GOLD = (g: number) => BigInt(Math.round(g * 100));

type TournamentRow = Prisma.TournamentGetPayload<{ include: { teams: true; matches: true } }>;
type TournamentWithTeams = Prisma.TournamentGetPayload<{ include: { teams: true } }>;
type MatchRow = Prisma.TournamentMatchGetPayload<object>;
type Cfg = (typeof TOURNAMENT_CFG)[keyof typeof TOURNAMENT_CFG];

/**
 * Tournament engine (7 regular types) — wiki §tournaments.
 *
 * Lifecycle: REGISTERING → (startsAt due) RUNNING → FINISHED + rewards, driven by
 * the 60s battle-sweep tick (and the admin POST /events/tick for tests).
 *
 * Kinds:
 *  - BRACKET (ARMY_CUP, COUNTRY_CUP, ONE_VS_ONE): single elimination, byes advance.
 *  - GROUPS (GUNPOWDER_CUP): 2 round-robin groups → semis A1-B2/A2-B1 → final.
 *  - BATTLE (GLOBAL_WAR): all registered countries split into two sides, one match.
 *  - MELEE (FIRST_AID, QUICKDROP_CUP): no matches — free-for-all, live hits counter
 *    per country team (wiki: live country damage counter), ranked at the end.
 *
 * A hit costs 10 HP + 1 ammo exactly like a war fight; per-round hits decide
 * round wins (best-of-N), matches settle with total-hits tiebreak.
 */
@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService,
    private readonly redis: RedisService,
    private readonly equipment: EquipmentService,
  ) {}

  list(status?: string) {
    return this.prisma.tournament.findMany({
      where: status ? { status: status as never } : {},
      include: { teams: true, matches: { orderBy: [{ round: "asc" }, { id: "asc" }] } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  /** Create a tournament of any of the 7 types. Admin-only. */
  async create(adminId: string, dto: { type: string; startsInMinutes?: number; config?: Record<string, unknown> }) {
    const admin = await this.prisma.citizen.findUniqueOrThrow({ where: { id: adminId }, select: { isAdmin: true } });
    if (!admin.isAdmin) throw new ForbiddenException("admins only");
    const cfg = TOURNAMENT_CFG[dto.type];
    if (!cfg) throw new BadRequestException("unknown tournament type");
    return this.prisma.tournament.create({
      data: {
        type: dto.type as never,
        config: (dto.config ?? {}) as never,
        startsAt: new Date(Date.now() + (dto.startsInMinutes ?? 30) * 60_000),
      },
    });
  }

  /** Register a team (citizen for 1v1, army for Army Cup, country for the cups). */
  async register(citizen: { id: string; citizenshipCountryId: string }, tournamentId: string, name?: string) {
    const t = await this.prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
    const cfg = TOURNAMENT_CFG[t.type];
    if (!t || t.status !== "REGISTERING") throw new BadRequestException("registration closed");

    // Per-type team identity + entry fee (wiki: 1v1 50g entry, Army Cup 125g + ≥5 members).
    let data: Prisma.TournamentTeamUncheckedCreateInput;
    if (t.type === "ONE_VS_ONE") {
      const dupe = await this.prisma.tournamentTeam.findFirst({ where: { tournamentId, citizenId: citizen.id } });
      if (dupe) throw new ConflictException("already registered");
      const me = await this.prisma.citizen.findUniqueOrThrow({ where: { id: citizen.id }, select: { nickname: true } });
      data = { tournamentId, name: name ?? me.nickname, citizenId: citizen.id, countryId: citizen.citizenshipCountryId };
    } else if (t.type === "ARMY_CUP") {
      const muId = name; // Army Cup: the body param carries the army id
      const mu = await this.prisma.militaryUnit.findUnique({ where: { id: muId }, include: { members: { select: { citizenId: true } } } });
      if (!mu) throw new NotFoundException("army not found");
      if (mu.leaderId !== citizen.id) throw new ForbiddenException("only the army leader registers the army");
      if (mu.members.length < (cfg.minMembers ?? 0)) {
        throw new BadRequestException(`army needs at least ${cfg.minMembers} members`);
      }
      const dupe = await this.prisma.tournamentTeam.findFirst({ where: { tournamentId, muId } });
      if (dupe) throw new ConflictException("army already registered");
      data = { tournamentId, name: mu.name, muId, countryId: mu.countryId, citizenId: citizen.id };
    } else {
      const dupe = await this.prisma.tournamentTeam.findFirst({ where: { tournamentId, countryId: citizen.citizenshipCountryId } });
      if (dupe) throw new ConflictException("country already registered");
      const country = await this.prisma.country.findUniqueOrThrow({ where: { id: citizen.citizenshipCountryId }, select: { name: true } });
      data = { tournamentId, name: name ?? country.name, countryId: citizen.citizenshipCountryId, citizenId: citizen.id };
    }

    return this.redis.withLock(`tournament:${tournamentId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        if (cfg.fee) {
          try {
            await this.game.moveGold(tx, { type: "CITIZEN", id: citizen.id }, null, GOLD(cfg.fee), "OTHER", { kind: "TOURNAMENT_FEE", type: t.type });
          } catch (e) {
            if (e instanceof Error && e.message === "INSUFFICIENT_GOLD") throw new BadRequestException(`entry fee is ${cfg.fee}g`);
            throw e;
          }
        }
        return tx.tournamentTeam.create({ data });
      }),
    );
  }

  // ===========================================================================
  // Hitting
  // ===========================================================================

  /**
   * Register one hit in a match (bracket/groups/battle kinds). Costs 10 HP + 1 ammo.
   * The hitter's side is derived from their team membership.
   */
  async hitMatch(citizen: { id: string; citizenshipCountryId: string; hp: number; level: number; strength: number; locationRegionId: string }, matchId: string) {
    const match = await this.prisma.tournamentMatch.findUnique({ where: { id: matchId }, include: { tournament: true } });
    if (!match) throw new NotFoundException("match not found");
    const t = match.tournament;
    if (t.status !== "RUNNING") throw new ConflictException("tournament is not running");
    if (match.winnerTeamId) throw new ConflictException("match already decided");
    if (!match.roundEndsAt || match.roundEndsAt <= new Date()) throw new ConflictException("no active round");

    const side = await this.sideOf(t, match.teamAId, match.teamBId, citizen);
    await this.consumeHitResources(citizen.id, citizen.hp);

    return this.prisma.$transaction(async (tx: Tx) => {
      await tx.tournamentMatch.update({
        where: { id: match.id },
        data: {
          hitsA: side === "A" ? { increment: 1 } : undefined,
          hitsB: side === "B" ? { increment: 1 } : undefined,
          roundHitsA: side === "A" ? { increment: 1 } : undefined,
          roundHitsB: side === "B" ? { increment: 1 } : undefined,
        },
      });
      const teamId = side === "A" ? match.teamAId : match.teamBId;
      await this.recordHit(tx, t.id, teamId, match.id, citizen.id);
      return { ok: true, side };
    });
  }

  /** Register one hit in a melee event (FIRST_AID, QUICKDROP_CUP): live country counter. */
  async hitMelee(citizen: { id: string; citizenshipCountryId: string; hp: number; level: number; strength: number; locationRegionId: string }, tournamentId: string) {
    const t = await this.prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (!t) throw new NotFoundException("tournament not found");
    const cfg = TOURNAMENT_CFG[t.type];
    if (t.status !== "RUNNING" || cfg.kind !== "MELEE") throw new ConflictException("event is not running");
    if (t.endsAt && t.endsAt <= new Date()) throw new ConflictException("event window has closed");
    const team = await this.prisma.tournamentTeam.findFirst({ where: { tournamentId, countryId: citizen.citizenshipCountryId } });
    if (!team) throw new ForbiddenException("your country is not registered in this event");
    await this.consumeHitResources(citizen.id, citizen.hp);

    return this.prisma.$transaction(async (tx: Tx) => {
      await tx.tournamentTeam.update({ where: { id: team.id }, data: { points: { increment: 1 } } });
      await this.recordHit(tx, t.id, team.id, t.id, citizen.id); // melee sentinel matchId = tournament id
      return { ok: true, team: team.name };
    });
  }

  // ===========================================================================
  // Tick — starts, round settlement, bracket advancement, rewards
  // ===========================================================================

  async tick() {
    const now = new Date();
    let started = 0, settled = 0, finished = 0;

    const due = await this.prisma.tournament.findMany({
      where: { status: "REGISTERING", startsAt: { lte: now } },
      include: { teams: true },
    });
    for (const t of due) {
      await this.startTournament(t);
      started++;
    }

    const running = await this.prisma.tournament.findMany({
      where: { status: "RUNNING" },
      include: { teams: true, matches: { orderBy: [{ round: "asc" }, { id: "asc" }] } },
    });
    for (const t of running) {
      const cfg = TOURNAMENT_CFG[t.type];
      if (cfg.kind === "MELEE") {
        if (t.endsAt && t.endsAt <= now) {
          await this.finishMelee(t);
          finished++;
        }
        continue;
      }
      for (const match of t.matches.filter((m) => !m.winnerTeamId)) {
        if (await this.settleMatch(t, match)) settled++;
      }
      const done = await this.advanceBracket(t);
      if (done) finished++;
    }
    return { started, settled, finished };
  }

  // ---------------------------------------------------------------------------

  private async startTournament(t: { id: string; type: string } & TournamentWithTeams) {
    const cfg = TOURNAMENT_CFG[t.type];
    return this.redis.withLock(`tournament:${t.id}`, 10000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const fresh = await tx.tournament.findUnique({ where: { id: t.id }, include: { teams: true } });
        if (!fresh || fresh.status !== "REGISTERING") return;
        const teams = [...fresh.teams];
        if (teams.length < 2 || (cfg.kind === "GROUPS" && teams.length < 4)) {
          await this.refundAndClose(tx, fresh);
          return;
        }
        // shuffle for fair seeding
        for (let i = teams.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [teams[i], teams[j]] = [teams[j], teams[i]];
        }
        if (cfg.kind === "BATTLE") {
          // All registered countries split into two sides; mapping stored in config.
          const half = Math.ceil(teams.length / 2);
          const sideA = teams.slice(0, half);
          const sideB = teams.slice(half);
          const sideOf: Record<string, string> = {};
          for (const team of sideA) if (team.countryId) sideOf[team.countryId] = "A";
          for (const team of sideB) if (team.countryId) sideOf[team.countryId] = "B";
          const aggA = await tx.tournamentTeam.create({ data: { tournamentId: t.id, name: "Side A" } });
          const aggB = await tx.tournamentTeam.create({ data: { tournamentId: t.id, name: "Side B" } });
          await this.createMatch(tx, t.id, 1, aggA.id, aggB.id, cfg, 0);
          await tx.tournament.update({ where: { id: t.id }, data: { status: "RUNNING", config: { ...(fresh.config as object), sideOf } as never } });
          return;
        }
        if (cfg.kind === "MELEE") {
          await tx.tournament.update({
            where: { id: t.id },
            data: { status: "RUNNING", endsAt: new Date(Date.now() + cfg.rounds * cfg.roundMinutes * 60_000) },
          });
          return;
        }
        if (cfg.kind === "GROUPS") {
          const mid = Math.ceil(teams.length / 2);
          const groups = [teams.slice(0, mid), teams.slice(mid)];
          const groupIds = groups.map((g) => g.map((team) => team.id));
          for (const group of groups) {
            for (let i = 0; i < group.length; i++) {
              for (let j = i + 1; j < group.length; j++) {
                await this.createMatch(tx, t.id, 0, group[i].id, group[j].id, cfg, 0);
              }
            }
          }
          // Persist group membership — the knockouts need it for standings.
          await tx.tournament.update({ where: { id: t.id }, data: { status: "RUNNING", config: { ...(fresh.config as object), groups: groupIds } as never } });
          return;
        }
        // BRACKET — round 1 pairings; odd team gets a bye.
        await this.createBracketRound(tx, t.id, teams.map((team) => team.id), 1, cfg);
        await tx.tournament.update({ where: { id: t.id }, data: { status: "RUNNING" } });
      }),
    );
  }

  private async createBracketRound(tx: Tx, tournamentId: string, teamIds: string[], bracketRound: number, cfg: Cfg) {
    for (let i = 0; i + 1 < teamIds.length; i += 2) {
      await this.createMatch(tx, tournamentId, bracketRound, teamIds[i], teamIds[i + 1], cfg, bracketRound - 1);
    }
    if (teamIds.length % 2 === 1) {
      const bye = teamIds[teamIds.length - 1];
      if (teamIds.length === 1) return; // champion already decided
      // Odd team out advances without playing (walkover).
      await tx.tournamentMatch.create({
        data: { tournamentId, round: bracketRound, teamAId: bye, teamBId: bye, winnerTeamId: bye, currentRound: cfg.rounds, roundWinsA: cfg.wins, roundEndsAt: new Date() },
      });
    }
  }

  private async createMatch(tx: Tx, tournamentId: string, bracketRound: number, teamAId: string, teamBId: string, cfg: Cfg, roundIdx: number) {
    const firstMs = (roundIdx === 0 && cfg.firstRoundMinutes ? cfg.firstRoundMinutes : cfg.roundMinutes) * 60_000;
    await tx.tournamentMatch.create({
      data: {
        tournamentId,
        round: bracketRound,
        teamAId,
        teamBId,
        roundEndsAt: new Date(Date.now() + firstMs),
        endsAt: new Date(Date.now() + cfg.rounds * cfg.roundMinutes * 60_000),
      },
    });
  }

  /** Close any due round; decide the match when a side reaches the wins target or rounds run out. */
  private async settleMatch(t: { id: string; type: string }, match: MatchRow) {
    const cfg = TOURNAMENT_CFG[t.type];
    const now = new Date();
    if (!match.roundEndsAt || match.roundEndsAt > now) return false;
    return this.redis.withLock(`match:${match.id}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const fresh = await tx.tournamentMatch.findUniqueOrThrow({ where: { id: match.id } });
        if (fresh.winnerTeamId || !fresh.roundEndsAt || fresh.roundEndsAt > new Date()) return false;
        let { roundWinsA, roundWinsB, currentRound } = fresh;
        if (fresh.roundHitsA !== fresh.roundHitsB) {
          if (fresh.roundHitsA > fresh.roundHitsB) roundWinsA++;
          else roundWinsB++;
        }
        const decided = roundWinsA >= cfg.wins || roundWinsB >= cfg.wins || currentRound >= cfg.rounds;
        if (decided) {
          const winner = roundWinsA === roundWinsB
            ? (fresh.hitsA >= fresh.hitsB ? fresh.teamAId : fresh.teamBId) // total-hits tiebreak
            : roundWinsA > roundWinsB ? fresh.teamAId : fresh.teamBId;
          await tx.tournamentMatch.update({
            where: { id: fresh.id },
            data: { roundWinsA, roundWinsB, winnerTeamId: winner },
          });
          await tx.tournamentTeam.update({ where: { id: winner }, data: { points: { increment: 3 } } });
        } else {
          currentRound += 1;
          await tx.tournamentMatch.update({
            where: { id: fresh.id },
            data: { roundWinsA, roundWinsB, currentRound, roundHitsA: 0, roundHitsB: 0, roundEndsAt: new Date(fresh.roundEndsAt.getTime() + cfg.roundMinutes * 60_000) },
          });
        }
        return true;
      }),
    );
  }

  /** Create the next bracket stage / knockout stage; finish + reward when everything is decided. */
  private async advanceBracket(t: TournamentRow) {
    const cfg = TOURNAMENT_CFG[t.type];
    const matches = await this.prisma.tournamentMatch.findMany({ where: { tournamentId: t.id }, orderBy: [{ round: "asc" }, { id: "asc" }] });
    if (matches.length === 0 || matches.some((m) => !m.winnerTeamId)) return false;
    const maxRound = Math.max(...matches.map((m) => m.round));
    const finalRoundMatches = matches.filter((m) => m.round === maxRound);

    if (cfg.kind === "BRACKET") {
      if (finalRoundMatches.length === 1) {
        await this.finishBracket(t, matches, finalRoundMatches[0]);
        return true;
      }
      const winners = finalRoundMatches.map((m) => m.winnerTeamId!);
      await this.prisma.$transaction((tx: Tx) => this.createBracketRound(tx, t.id, winners, maxRound + 1, cfg));
      return false;
    }
    if (cfg.kind === "GROUPS") {
      if (maxRound === 0) {
        // Group stage done → standings per stored group → semis A1-B2 / A2-B1
        // (wiki tiebreakers: points → total hits → id).
        const cfgGroups = ((t.config as { groups?: string[][] })?.groups) ?? [];
        const allTeams = await this.prisma.tournamentTeam.findMany({ where: { tournamentId: t.id, name: { notIn: ["Side A", "Side B"] } } });
        const totals = await this.prisma.tournamentHit.groupBy({ by: ["teamId"], where: { tournamentId: t.id, matchId: { not: t.id } }, _sum: { hits: true } });
        const hitsOf = new Map(totals.map((r) => [r.teamId, r._sum.hits ?? 0]));
        const teamWins = new Map<string, number>();
        for (const m of matches) if (m.winnerTeamId) teamWins.set(m.winnerTeamId, (teamWins.get(m.winnerTeamId) ?? 0) + 1);
        const rank = (group: typeof allTeams) => [...group].sort((a, b) => {
          const pa = (teamWins.get(a.id) ?? 0) * 3, pb = (teamWins.get(b.id) ?? 0) * 3;
          if (pa !== pb) return pb - pa;
          const ha = hitsOf.get(a.id) ?? 0, hb = hitsOf.get(b.id) ?? 0;
          if (ha !== hb) return hb - ha;
          return a.id.localeCompare(b.id);
        });
        const byId = new Map(allTeams.map((team) => [team.id, team]));
        const g1 = rank(cfgGroups[0]?.map((id) => byId.get(id)!).filter(Boolean) ?? []);
        const g2 = rank(cfgGroups[1]?.map((id) => byId.get(id)!).filter(Boolean) ?? []);
        await this.prisma.$transaction(async (tx: Tx) => {
          await this.createMatch(tx, t.id, maxRound + 1, g1[0].id, g2[1].id, cfg, 1);
          await this.createMatch(tx, t.id, maxRound + 1, g2[0].id, g1[1].id, cfg, 1);
        });
        return false;
      }
      if (finalRoundMatches.length === 2) {
        const winners = finalRoundMatches.map((m) => m.winnerTeamId!);
        await this.prisma.$transaction((tx: Tx) => this.createMatch(tx, t.id, maxRound + 1, winners[0], winners[1], cfg, 2));
        return false;
      }
      await this.finishBracket(t, matches, finalRoundMatches[0]);
      return true;
    }
    // BATTLE (GLOBAL_WAR): the single match decided → finish.
    await this.finishBracket(t, matches, finalRoundMatches[0]);
    return true;
  }

  /** Bracket finished: placements + per-type rewards, then FINISHED. */
  private async finishBracket(t: { id: string; type: string }, matches: { round: number; teamAId: string; teamBId: string; winnerTeamId: string | null; hitsA: number; hitsB: number }[], final: { teamAId: string; teamBId: string; winnerTeamId: string | null; hitsA: number; hitsB: number }) {
    const champion = final.winnerTeamId!;
    const runnerUp = champion === final.teamAId ? final.teamBId : final.teamAId;
    const semisLosers = matches
      .filter((m) => m.winnerTeamId && m.round === Math.max(...matches.map((x) => x.round)) - 1)
      .map((m) => (m.winnerTeamId === m.teamAId ? m.teamBId : m.teamAId));
    const placements = [champion, runnerUp, ...semisLosers];

    await this.prisma.$transaction(async (tx: Tx) => {
      switch (t.type) {
        case "ONE_VS_ONE": {
          // Gold ladder 1000/500/250/50 (wiki).
          const ladder = [1000, 500, 250, 50];
          for (let i = 0; i < placements.length && i < ladder.length; i++) {
            const team = await tx.tournamentTeam.findUniqueOrThrow({ where: { id: placements[i] }, select: { citizenId: true } });
            if (team.citizenId) {
              await tx.citizen.update({ where: { id: team.citizenId }, data: { gold: { increment: GOLD(ladder[i]) } } });
              await tx.transaction.create({
                data: { asset: "GOLD", reason: "OTHER", amount: GOLD(ladder[i]), toType: "CITIZEN", toId: team.citizenId, meta: { kind: "TOURNAMENT_REWARD", type: t.type, place: i + 1 } as Prisma.InputJsonValue },
              });
              await this.game.notify(tx, team.citizenId, "TOURNAMENT_REWARD", { type: t.type, place: i + 1, gold: ladder[i] });
            }
          }
          break;
        }
        case "ARMY_CUP": {
          // Armies: 500/250/150/50g into the vault; players: Q5/Q4/Q3 Laser + FAK tiers on the champion.
          const muLadder = [500, 250, 150, 50];
          for (let i = 0; i < placements.length && i < muLadder.length; i++) {
            const team = await tx.tournamentTeam.findUniqueOrThrow({ where: { id: placements[i] }, select: { muId: true } });
            if (team.muId) await tx.militaryUnit.update({ where: { id: team.muId }, data: { gold: { increment: GOLD(muLadder[i]) } } });
          }
          await this.rewardTopHitters(tx, t.id, champion, [{ laser: 5, fak: 3 }, { laser: 4, fak: 2 }, { laser: 3, fak: 1 }]);
          break;
        }
        case "COUNTRY_CUP": {
          // Q5 Laser to the champion's top damage player, Q4→Q1 to the next four (wiki).
          await this.rewardTopHitters(tx, t.id, champion, [{ laser: 5 }, { laser: 4 }, { laser: 3 }, { laser: 2 }, { laser: 1 }]);
          break;
        }
        case "GUNPOWDER_CUP": {
          // Gunpowder to the champion's national org (country stockpile), Q5/Q4/Q3 Laser + FAK + achievement.
          const champ = await tx.tournamentTeam.findUniqueOrThrow({ where: { id: champion }, select: { countryId: true } });
          if (champ.countryId) {
            await tx.storage.upsert({
              where: { ownerType_ownerId_product_quality: { ownerType: "COUNTRY", ownerId: champ.countryId, product: "GUNPOWDER", quality: 0 } },
              create: { ownerType: "COUNTRY", ownerId: champ.countryId, product: "GUNPOWDER", quality: 0, quantity: 100 },
              update: { quantity: { increment: 100 } },
            });
          }
          await this.rewardTopHitters(tx, t.id, champion, [{ laser: 5, fak: 3 }, { laser: 4, fak: 2 }, { laser: 3, fak: 1 }], "GUNPOWDER_CHAMPION");
          break;
        }
        case "GLOBAL_WAR": {
          // 1 FAK to every member of the winning side (wiki).
          const fresh = await tx.tournament.findUniqueOrThrow({ where: { id: t.id } });
          const sideOf = ((fresh.config as { sideOf?: Record<string, string> })?.sideOf) ?? {};
          const sideTeams = await tx.tournamentTeam.findMany({ where: { tournamentId: t.id, name: { in: ["Side A", "Side B"] } } });
          const winner = sideTeams.find((s) => s.id === champion);
          const winningLetter = winner?.name === "Side B" ? "B" : "A";
          const countries = Object.entries(sideOf).filter(([, s]) => s === winningLetter).map(([c]) => c);
          const members = await tx.citizen.findMany({ where: { citizenshipCountryId: { in: countries } }, select: { id: true } });
          for (const m of members) {
            await tx.citizen.update({ where: { id: m.id }, data: { firstAidKits: { increment: 1 } } });
            await this.game.notify(tx, m.id, "TOURNAMENT_REWARD", { type: t.type, fak: 1 });
          }
          break;
        }
      }
      await tx.tournament.update({ where: { id: t.id }, data: { status: "FINISHED", endsAt: new Date() } });
    });
  }

  /** Melee finished: rank by the live hits counter and pay FAK by rank (wiki: top10→5 … 41-50→1). */
  private async finishMelee(t: { id: string; type: string }) {
    await this.prisma.$transaction(async (tx: Tx) => {
      const teams = await tx.tournamentTeam.findMany({ where: { tournamentId: t.id }, orderBy: [{ points: "desc" }, { id: "asc" }] });
      for (let i = 0; i < teams.length; i++) {
        let fak: number;
        if (t.type === "FIRST_AID") fak = Math.max(0, 5 - Math.floor(i / 10)); // rank 1-10→5 … 41-50→1, 51+→0
        else fak = i < 5 ? 5 - i : 0; // QUICKDROP_CUP: top-5 countries
        const countryId = teams[i].countryId;
        if (fak <= 0 || !countryId) continue;
        const members = await tx.citizen.findMany({ where: { citizenshipCountryId: countryId }, select: { id: true } });
        for (const m of members) {
          await tx.citizen.update({ where: { id: m.id }, data: { firstAidKits: { increment: fak } } });
          await this.game.notify(tx, m.id, "TOURNAMENT_REWARD", { type: t.type, place: i + 1, fak });
        }
      }
      await tx.tournament.update({ where: { id: t.id }, data: { status: "FINISHED", endsAt: new Date() } });
    });
  }

  /** Give laser/FAK/achievement rewards to a team's top hitters (aggregate across matches). */
  private async rewardTopHitters(tx: Tx, tournamentId: string, teamId: string, tiers: { laser?: number; fak?: number }[], achievementKey?: string) {
    const top = await tx.tournamentHit.groupBy({
      by: ["citizenId"],
      where: { tournamentId, teamId, matchId: { not: tournamentId } },
      _sum: { hits: true },
      orderBy: { _sum: { hits: "desc" } },
      take: tiers.length,
    });
    for (let i = 0; i < top.length; i++) {
      const { laser, fak } = tiers[i];
      const citizenId = top[i].citizenId;
      if (laser) await this.equipment.grantLaser(tx, citizenId, laser);
      if (fak) await tx.citizen.update({ where: { id: citizenId }, data: { firstAidKits: { increment: fak } } });
      if (achievementKey) await this.game.trackAchievement(tx, citizenId, "EVENTS", achievementKey, 1, 1);
      await this.game.notify(tx, citizenId, "TOURNAMENT_REWARD", { tournamentId, laser, fak });
    }
  }

  /** Refund entry fees and close a tournament that never gathered enough teams. */
  private async refundAndClose(tx: Tx, t: { id: string; type: string; teams: { citizenId: string | null }[] }) {
    const cfg = TOURNAMENT_CFG[t.type];
    if (cfg.fee) {
      for (const team of t.teams) {
        if (team.citizenId) {
          await this.game.moveGold(tx, null, { type: "CITIZEN", id: team.citizenId }, GOLD(cfg.fee), "OTHER", { kind: "TOURNAMENT_REFUND", type: t.type });
        }
      }
    }
    await tx.tournament.update({ where: { id: t.id }, data: { status: "FINISHED", endsAt: new Date() } });
  }

  /** Which side (A/B) the citizen fights on for this match — membership-derived, per-type exclusive. */
  private async sideOf(t: { id: string; type: string; config: unknown }, teamAId: string, teamBId: string, citizen: { id: string; citizenshipCountryId: string }): Promise<"A" | "B"> {
    for (const [side, teamId] of [["A", teamAId], ["B", teamBId]] as const) {
      const team = await this.prisma.tournamentTeam.findUnique({ where: { id: teamId } });
      if (!team) continue;
      if (t.type === "ONE_VS_ONE") {
        // 1v1: only the rostered competitor (citizens may share a country).
        if (team.citizenId === citizen.id) return side;
        continue;
      }
      if (t.type === "ARMY_CUP") {
        // Armies: membership only — two armies can share a country.
        if (team.muId) {
          const mem = await this.prisma.muMembership.findFirst({ where: { muId: team.muId, citizenId: citizen.id }, select: { citizenId: true } });
          if (mem) return side;
        }
        continue;
      }
      if (team.name === "Side A" || team.name === "Side B") {
        // GLOBAL_WAR aggregate sides — mapping in tournament config.
        const sideOf = ((t.config as { sideOf?: Record<string, string> })?.sideOf) ?? {};
        if (sideOf[citizen.citizenshipCountryId] === team.name.slice(-1)) return side;
        continue;
      }
      if (team.countryId && team.countryId === citizen.citizenshipCountryId) return side;
    }
    throw new ForbiddenException("you are not part of either team");
  }

  /** A hit costs the same as a war fight: 10 HP + 1 ammo of the best quality in storage. */
  private async consumeHitResources(citizenId: string, hp: number) {
    const res = await this.prisma.citizen.updateMany({ where: { id: citizenId, hp: { gte: HP_HIT_COST } }, data: { hp: { decrement: HP_HIT_COST } } });
    if (res.count === 0) throw new BadRequestException("not enough health — use FAKs or wait for regen");
    const ammo = await this.prisma.storage.findFirst({
      where: { ownerType: "CITIZEN", ownerId: citizenId, product: "AMMO", quantity: { gt: 0 } },
      orderBy: { quality: "desc" },
    });
    if (ammo) {
      await this.prisma.storage.update({ where: { id: ammo.id }, data: { quantity: { decrement: 1 } } });
    }
    void hp;
  }

  private async recordHit(tx: Tx, tournamentId: string, teamId: string, matchId: string, citizenId: string) {
    const existing = await tx.tournamentHit.findUnique({
      where: { tournamentId_citizenId_matchId: { tournamentId, citizenId, matchId } },
    });
    if (existing) await tx.tournamentHit.update({ where: { id: existing.id }, data: { hits: { increment: 1 } } });
    else await tx.tournamentHit.create({ data: { tournamentId, teamId, matchId, citizenId, hits: 1 } });
  }
}
