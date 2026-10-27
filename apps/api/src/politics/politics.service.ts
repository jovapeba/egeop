import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ATTACK_REGION_COST_NEUTRAL,
  ATTACK_REGION_COST_PLAYABLE,
  CITIZENSHIP_FEE,
  CITIZENSHIP_MONTHLY_CAP,
  CONGRESS_LIST_DAYS,
  CONGRESS_SEATS,
  ELECTION_CYCLE_DAYS,
  FEATURE_LEVELS,
  FIXED_PARTIES,
  IMPEACH_THRESHOLD,
  LAW_VOTE_WINDOW_HOURS,
  PRESIDENT_CANDIDATURE_DAYS,
  PRESIDENT_LAWS_PER_DAY,
  PRESIDENT_FEE,
  PARTY_CANDIDATURE_DAYS,
  PARTY_LEADER_FEE,
  PRINT_MONEY_GOLD_PER_CC,
  PRINT_MONEY_MAX_GOLD,
  PRINT_MONEY_MIN_GOLD,
  EMBARGO_COST,
  EMBARGO_DAYS,
  CABINET_ROLES,
  TREATY_FEE_GOLD,
  VCP_WAR_LAWS,
  WAR_DECLARE_COST_NEUTRAL,
  WAR_DECLARE_COST_PLAYABLE,
  XP_WIN_CONGRESS,
  XP_WIN_PRESIDENT,
  XP_WIN_PARTY_LEADER,
  XP_PER_LAW_VOTE,
} from "@egeopolis/game-core";
import { Prisma } from "@prisma/client";
import { PrismaService, type Tx } from "../prisma/prisma.service";
import { GameService } from "../game/game.service";
import { RedisService } from "../redis/redis.service";
import { WarsService } from "../wars/wars.service";

const GOLD = (g: number) => BigInt(Math.round(g * 100));

/** Permission matrix (v2). */
const CONGRESS_LAWS = new Set([
  "CHANGE_TAX", "SET_MIN_SALARY", "PRINT_MONEY", "TREASURY_TRANSFER", "ISSUE_BONDS",
  "IMPEACH", "ELECT_PRESIDENT", "REVOKE_CITIZENSHIP", "CITIZENSHIP_REQUEST",
  "MARKETPLACE_EMBARGO", "JOB_EMBARGO", "MONETARY_EMBARGO", "CANCEL_EMBARGO",
]);
const PRESIDENT_LAWS = new Set([
  "DECLARE_WAR", "ATTACK_REGION", "CEASEFIRE", "DEPLOY_BUILDING", "DEMOLISH_BUILDING",
  "JOIN_ALLIANCE", "LEAVE_ALLIANCE", "CREATE_ALLIANCE", "RIVAL_COUNTRY",
  "NAP", "PROPOSE_MDMA", "CANCEL_MDMA",
]);
/** Laws a minister role may propose on top of congress/president rights (wiki: MoD/MoE). */
const MINISTER_PROPOSABLE: Record<string, Set<string>> = {
  DEFENSE: new Set(["DEPLOY_BUILDING", "DEMOLISH_BUILDING", "NAP", "PROPOSE_MDMA", "CANCEL_MDMA"]),
  FINANCE: new Set(["CHANGE_TAX", "SET_MIN_SALARY", "PRINT_MONEY", "MARKETPLACE_EMBARGO", "JOB_EMBARGO", "MONETARY_EMBARGO", "CANCEL_EMBARGO"]),
};
/** Treaty laws cost the proposing country treasury 10g (wiki: MDMA). */
const TREATY_LAWS = new Set(["PROPOSE_MDMA", "CANCEL_MDMA"]);

@Injectable()
export class PoliticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService,
    private readonly redis: RedisService,
    private readonly wars: WarsService,
  ) {}

  // ===========================================================================
  // PARTIES — 5 fixed per country
  // ===========================================================================

  async parties(countryId?: string, citizenId?: string) {
    const list = await this.prisma.party.findMany({
      where: countryId ? { countryId } : {},
      include: {
        _count: { select: { members: true } },
        leader: { select: { id: true, nickname: true } },
        ...(citizenId
          ? {
              members: {
                where: { citizenId },
                select: { citizenId: true },
              },
            }
          : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    const userMembership = citizenId
      ? await this.prisma.partyMembership.findUnique({ where: { citizenId } })
      : null;

    return list.map((p) => {
      const isMember = citizenId ? ((p as any).members?.length ?? 0) > 0 : false;
      const isLeader = citizenId ? p.leaderId === citizenId : false;
      const { members, ...rest } = p as any;
      return {
        ...rest,
        isMember,
        isLeader,
        hasAnyParty: citizenId ? !!userMembership : false,
      };
    });
  }

  async joinParty(citizen: { id: string; level: number }, partyId: string) {
    if (citizen.level < FEATURE_LEVELS.JOIN_PARTY) throw new ForbiddenException(`level ${FEATURE_LEVELS.JOIN_PARTY} required`);
    const membership = await this.prisma.partyMembership.findUnique({ where: { citizenId: citizen.id } });
    if (membership) throw new ConflictException("leave your current party first");
    await this.prisma.partyMembership.create({ data: { partyId, citizenId: citizen.id } });
    return { ok: true };
  }

  async leaveParty(citizenId: string) {
    const membership = await this.prisma.partyMembership.findUnique({ where: { citizenId }, include: { party: true } });
    if (membership?.party.leaderId === citizenId) {
      const members = await this.prisma.partyMembership.findMany({
        where: { partyId: membership.partyId, citizenId: { not: citizenId } },
        include: { citizen: { select: { xp: true, id: true } } },
      });
      members.sort((a, b) => b.citizen.xp - a.citizen.xp);
      if (members[0]) await this.prisma.party.update({ where: { id: membership.partyId }, data: { leaderId: members[0].citizenId } });
    }
    await this.prisma.partyMembership.deleteMany({ where: { citizenId } });
    return { ok: true };
  }

  // ===========================================================================
  // ELECTIONS — presidential d1 (candidature d28–30), party d11 (d8–10),
  // congress d21 (lists d18–20, party presidents submit ≤ 20 candidates)
  // ===========================================================================

  cycleDay(day: number): number {
    return ((day - 1) % ELECTION_CYCLE_DAYS) + 1;
  }

  /** Alliances with their member countries (alliance management UI). */
  allianceList() {
    return this.prisma.alliance.findMany({
      include: {
        members: {
          include: { country: { select: { id: true, name: true, code: true, flagColor: true } } },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  /** National Organisation account (wiki: Country → Politics access). */
  orgInfo(countryId: string) {
    return this.prisma.nationalOrganisation.findUniqueOrThrow({
      where: { countryId },
      select: { id: true, countryId: true, name: true, gold: true, fiat: true },
    });
  }

  /** Citizens can donate their own gold/fiat to the NO (wiki: donations NO ↔ players). */
  async donateToOrg(citizenId: string, countryId: string, gold: number, fiat: number) {
    const goldCents = BigInt(Math.round(gold * 100));
    const fiatCents = BigInt(Math.round(fiat * 100));
    if (goldCents < BigInt(0) || fiatCents < BigInt(0)) throw new BadRequestException("amounts must be ≥ 0");
    if (goldCents === BigInt(0) && fiatCents === BigInt(0)) throw new BadRequestException("nothing to donate");
    return this.prisma.$transaction(async (tx: Tx) => {
      if (goldCents > BigInt(0)) {
        try {
          await this.game.moveGold(tx, { type: "CITIZEN", id: citizenId }, null, goldCents, "OTHER", { kind: "ORG_DONATION" });
        } catch (e) {
          if (e instanceof Error && e.message === "INSUFFICIENT_GOLD") throw new BadRequestException("not enough gold");
          throw e;
        }
        await this.game.orgGoldMove(tx, countryId, goldCents, { kind: "ORG_DONATION", from: citizenId });
      }
      if (fiatCents > BigInt(0)) {
        try {
          await this.game.walletDebit(tx, citizenId, countryId, fiatCents, "OTHER", { kind: "ORG_DONATION" });
        } catch (e) {
          if (e instanceof Error && e.message === "INSUFFICIENT_WALLET") throw new BadRequestException("not enough local currency");
          throw e;
        }
        await this.game.orgFiatMove(tx, countryId, fiatCents, { kind: "ORG_DONATION", from: citizenId });
      }
      return { ok: true };
    });
  }

  // ===========================================================================
  // CABINET — vCP + ministers (wiki: chosen from active congress members)
  // ===========================================================================

  cabinet(countryId: string) {
    return this.prisma.minister.findMany({
      where: { countryId },
      select: { citizenId: true, role: true, citizen: { select: { nickname: true } } },
    });
  }

  /** President assigns a congress member to a fixed cabinet role (one holder per role). */
  async assignMinister(actor: { id: string; citizenshipCountryId: string }, role: string, targetCitizenId: string) {
    const country = await this.prisma.country.findUniqueOrThrow({ where: { id: actor.citizenshipCountryId } });
    if (country.presidentId !== actor.id) throw new ForbiddenException("president only");
    if (!(CABINET_ROLES as readonly string[]).includes(role)) {
      throw new BadRequestException(`role must be one of ${CABINET_ROLES.join(", ")}`);
    }
    const target = await this.prisma.citizen.findUnique({ where: { id: targetCitizenId }, select: { citizenshipCountryId: true } });
    if (!target || target.citizenshipCountryId !== actor.citizenshipCountryId) throw new BadRequestException("target must be a citizen of your country");
    const seat = await this.prisma.congressSeat.findFirst({
      where: { citizenId: targetCitizenId, countryId: actor.citizenshipCountryId, active: true },
      select: { id: true },
    });
    if (!seat) throw new ForbiddenException("only active congress members are eligible for the cabinet");
    await this.prisma.minister.upsert({
      where: { countryId_role: { countryId: actor.citizenshipCountryId, role } },
      create: { countryId: actor.citizenshipCountryId, citizenId: targetCitizenId, role },
      update: { citizenId: targetCitizenId },
    });
    return { ok: true };
  }

  /** President fires a minister (or the vCP) from their role. */
  async fireMinister(actor: { id: string; citizenshipCountryId: string }, role: string) {
    const country = await this.prisma.country.findUniqueOrThrow({ where: { id: actor.citizenshipCountryId } });
    if (country.presidentId !== actor.id) throw new ForbiddenException("president only");
    const res = await this.prisma.minister.deleteMany({ where: { countryId: actor.citizenshipCountryId, role } });
    if (res.count === 0) throw new NotFoundException("no holder for this role");
    return { ok: true };
  }

  /** vCP / ministers may resign their own role. */
  async resignRole(actor: { id: string; citizenshipCountryId: string }) {
    const res = await this.prisma.minister.deleteMany({ where: { countryId: actor.citizenshipCountryId, citizenId: actor.id } });
    if (res.count === 0) throw new NotFoundException("you hold no cabinet role");
    return { ok: true, resigned: res.count };
  }

  /** CP or a minister moves NO funds to a fighter/citizen (wiki: NO donates supplies to its fighters). */
  async orgWithdraw(actor: { id: string; citizenshipCountryId: string }, toCitizenId: string, gold: number, fiat: number) {
    const countryId = actor.citizenshipCountryId;
    const [country, minister] = await Promise.all([
      this.prisma.country.findUniqueOrThrow({ where: { id: countryId }, select: { presidentId: true } }),
      this.prisma.minister.findFirst({ where: { countryId, citizenId: actor.id } }),
    ]);
    if (country.presidentId !== actor.id && !minister) throw new ForbiddenException("president or minister only");
    const goldCents = BigInt(Math.round(gold * 100));
    const fiatCents = BigInt(Math.round(fiat * 100));
    if (goldCents < BigInt(0) || fiatCents < BigInt(0)) throw new BadRequestException("amounts must be ≥ 0");
    if (goldCents === BigInt(0) && fiatCents === BigInt(0)) throw new BadRequestException("nothing to send");
    return this.prisma.$transaction(async (tx: Tx) => {
      if (goldCents > BigInt(0)) {
        try {
          await this.game.orgGoldMove(tx, countryId, -goldCents, { kind: "ORG_AID", to: toCitizenId });
        } catch (e) {
          if (e instanceof Error && e.message === "INSUFFICIENT_ORG_GOLD") throw new BadRequestException("organisation lacks gold");
          throw e;
        }
        await tx.citizen.update({ where: { id: toCitizenId }, data: { gold: { increment: goldCents } } });
        await tx.transaction.create({ data: { asset: "GOLD", reason: "SUBSIDY", amount: goldCents, fromType: "ORG", fromId: countryId, toType: "CITIZEN", toId: toCitizenId } });
      }
      if (fiatCents > BigInt(0)) {
        try {
          await this.game.orgFiatMove(tx, countryId, -fiatCents, { kind: "ORG_AID", to: toCitizenId });
        } catch (e) {
          if (e instanceof Error && e.message === "INSUFFICIENT_ORG_FIAT") throw new BadRequestException("organisation lacks currency");
          throw e;
        }
        await this.game.walletCredit(tx, toCitizenId, countryId, fiatCents, "SUBSIDY");
      }
      await this.game.notify(tx, toCitizenId, "ORG_AID", { country: countryId, gold: Number(goldCents) / 100, fiat: Number(fiatCents) / 100 });
      return { ok: true };
    });
  }

  async elections(countryId: string, citizenId?: string) {
    const day = await this.game.currentDay();
    const elections = await this.prisma.election.findMany({
      where: { countryId, day: { gte: day - 2 } },
      include: {
        candidacies: {
          include: {
            citizen: { select: { id: true, nickname: true } },
            party: { select: { name: true } },
          },
        },
        ...(citizenId
          ? {
              votes: {
                where: { citizenId },
                select: { citizenId: true, candidateId: true },
              },
            }
          : {}),
      },
    });

    return {
      day,
      cycleDay: this.cycleDay(day),
      elections: elections.map((e) => {
        const votes = (e as any).votes as Array<{ id: string; candidateId: string }> | undefined;
        const hasVoted = citizenId ? (votes?.length ?? 0) > 0 : false;
        const votedCandidateId = citizenId && votes && votes.length > 0 ? votes[0].candidateId : null;
        const { votes: _v, ...rest } = e as any;
        return {
          ...rest,
          hasVoted,
          votedCandidateId,
        };
      }),
    };
  }

  async electionTick() {
    const day = await this.game.currentDay();
    const cd = this.cycleDay(day);
    const countries = await this.prisma.country.findMany({ where: { active: true, type: "PLAYABLE" } });

    for (const country of countries) {
      // PRESIDENTIAL: candidature d28–30 (current cycle end) → vote d1 → close d2.
      if (PRESIDENT_CANDIDATURE_DAYS.includes(cd)) await this.ensureElection(country.id, "PRESIDENTIAL", cd === 28 ? day + 3 : cd === 29 ? day + 2 : day + 1);
      if (cd === 1) await this.setElectionStatus(country.id, "PRESIDENTIAL", "VOTING");
      if (cd === 2) await this.tallyPresidential(country.id, day);

      // PARTY: candidature d8–10 → vote d11 → close d12.
      if (PARTY_CANDIDATURE_DAYS.includes(cd)) await this.ensureElection(country.id, "PARTY_LEADER", cd === 8 ? day + 3 : cd === 9 ? day + 2 : day + 1);
      if (cd === 11) await this.setElectionStatus(country.id, "PARTY_LEADER", "VOTING");
      if (cd === 12) await this.tallyPartyLeader(country.id);

      // CONGRESS: lists d18–20 → vote d21 → close d22.
      if (CONGRESS_LIST_DAYS.includes(cd)) await this.ensureElection(country.id, "CONGRESS", cd === 18 ? day + 3 : cd === 19 ? day + 2 : day + 1);
      if (cd === 21) await this.setElectionStatus(country.id, "CONGRESS", "VOTING");
      if (cd === 22) await this.tallyCongress(country.id, day);
    }
    return { day, cycleDay: cd };
  }

  private ensureElection(countryId: string, type: "PRESIDENTIAL" | "PARTY_LEADER" | "CONGRESS", day: number) {
    return this.prisma.election.upsert({
      where: { countryId_type_day: { countryId, type, day } },
      create: { countryId, type, day },
      update: {},
    });
  }

  private async setElectionStatus(countryId: string, type: "PRESIDENTIAL" | "PARTY_LEADER" | "CONGRESS", status: "CANDIDATURE" | "VOTING" | "CLOSED") {
    const election = await this.prisma.election.findFirst({
      where: { countryId, type, status: { not: "CLOSED" } },
      orderBy: { day: "desc" },
    });
    if (election && election.status !== status) {
      await this.prisma.election.update({ where: { id: election.id }, data: { status } });
    }
  }

  async candidacy(citizen: { id: string; level: number; citizenshipCountryId: string }, electionId: string, presentation?: string) {
    return this.redis.withLock(`election:${electionId}`, 6000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const election = await tx.election.findUniqueOrThrow({ where: { id: electionId } });
        if (election.status !== "CANDIDATURE") throw new ConflictException("candidature window closed");
        if (citizen.citizenshipCountryId !== election.countryId) throw new ForbiddenException("home country only");
        if (citizen.level < FEATURE_LEVELS.CANDIDATE_PRESIDENT) throw new ForbiddenException(`level ${FEATURE_LEVELS.CANDIDATE_PRESIDENT} required`);

        const membership = await tx.partyMembership.findUnique({ where: { citizenId: citizen.id } });
        if (election.type === "PRESIDENTIAL") {
          const inCongress = await tx.congressSeat.findFirst({ where: { citizenId: citizen.id, active: true } });
          if (inCongress) throw new BadRequestException("congressmen cannot candidate for president");
          await this.game.moveGold(tx, { type: "CITIZEN", id: citizen.id }, null, GOLD(PRESIDENT_FEE), "OTHER");
        }
        if (election.type === "PARTY_LEADER") {
          if (!membership) throw new ForbiddenException("party members only");
          await this.game.moveGold(tx, { type: "CITIZEN", id: citizen.id }, null, GOLD(PARTY_LEADER_FEE), "OTHER");
        }
        if (election.type === "CONGRESS" && !membership) {
          throw new ForbiddenException("party members only");
        }
        return tx.candidacy.create({
          data: { electionId, citizenId: citizen.id, partyId: membership?.partyId ?? null, presentation },
        });
      }),
    );
  }

  async vote(citizen: { id: string; level: number; citizenshipCountryId: string }, electionId: string, candidateId: string) {
    if (citizen.level < FEATURE_LEVELS.VOTE) throw new ForbiddenException(`level ${FEATURE_LEVELS.VOTE} required`);
    return this.redis.withLock(`election:${electionId}`, 6000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const election = await tx.election.findUniqueOrThrow({ where: { id: electionId } });
        if (election.status !== "VOTING") throw new ConflictException("voting is not open");
        if (citizen.citizenshipCountryId !== election.countryId) throw new ForbiddenException("home country only");
        if (election.type === "PARTY_LEADER") {
          const member = await tx.partyMembership.findUnique({ where: { citizenId: citizen.id } });
          const candidate = await tx.candidacy.findUnique({ where: { id: candidateId } });
          if (!member || !candidate || member.partyId !== candidate.partyId) {
            throw new ForbiddenException("vote within your own party");
          }
        }
        return tx.vote.create({ data: { electionId, citizenId: citizen.id, candidateId } });
      }),
    );
  }

  private async tallyPresidential(countryId: string, day: number) {
    const election = await this.prisma.election.findFirst({
      where: { countryId, type: "PRESIDENTIAL", status: "VOTING" },
      orderBy: { day: "desc" },
      include: { candidacies: true },
    });
    if (!election) return;
    const counts = await this.prisma.vote.groupBy({
      by: ["candidateId"],
      where: { electionId: election.id },
      _count: { candidateId: true },
    });
    const tally = new Map(election.candidacies.map((c) => [c.id, { c, votes: 0 }]));
    for (const c of counts) if (tally.has(c.candidateId)) tally.get(c.candidateId)!.votes = c._count.candidateId;
    const winner = [...tally.values()].sort((a, b) => b.votes - a.votes)[0];
    await this.prisma.election.update({ where: { id: election.id }, data: { status: "CLOSED" } });
    if (winner && winner.votes > 0) {
      await this.prisma.country.update({ where: { id: countryId }, data: { presidentId: winner.c.citizenId } });
      await this.prisma.$transaction(async (tx: Tx) => {
        await this.game.applyProgress(tx, winner.c.citizenId, XP_WIN_PRESIDENT);
        await this.game.awardMedal(tx, winner.c.citizenId, "PRESIDENT", 20, { day });
        // 24h presidential pop-up banner (v2).
        for (const citizen of await tx.citizen.findMany({ where: { citizenshipCountryId: countryId }, select: { id: true } })) {
          await this.game.notify(tx, citizen.id, "PRESIDENTIAL_BANNER", { president: winner.c.citizenId, until: Date.now() + 86_400_000 });
        }
      });
    }
  }

  private async tallyPartyLeader(countryId: string) {
    void countryId;
    const elections = await this.prisma.election.findMany({
      where: { type: "PARTY_LEADER", status: "VOTING" },
      include: { candidacies: true },
    });
    for (const election of elections) {
      const counts = await this.prisma.vote.groupBy({
        by: ["candidateId"],
        where: { electionId: election.id },
        _count: { candidateId: true },
      });
      const tally = new Map(election.candidacies.map((c) => [c.id, { c, votes: 0 }]));
      for (const c of counts) if (tally.has(c.candidateId)) tally.get(c.candidateId)!.votes = c._count.candidateId;
      const winner = [...tally.values()].sort((a, b) => b.votes - a.votes)[0];
      await this.prisma.election.update({ where: { id: election.id }, data: { status: "CLOSED" } });
      if (winner && winner.votes > 0 && winner.c.partyId) {
        await this.prisma.party.update({ where: { id: winner.c.partyId }, data: { leaderId: winner.c.citizenId } });
        await this.prisma.$transaction(async (tx: Tx) => {
          await this.game.applyProgress(tx, winner.c.citizenId, XP_WIN_PARTY_LEADER);
        });
      }
    }
  }

  /** Congress: D'Hondt party-list allocation (≤ 20 seats). */
  private async tallyCongress(countryId: string, day: number) {
    const election = await this.prisma.election.findFirst({
      where: { countryId, type: "CONGRESS", status: "VOTING" },
      orderBy: { day: "desc" },
      include: { candidacies: true },
    });
    if (!election) return;

    const counts = await this.prisma.vote.groupBy({
      by: ["candidateId"],
      where: { electionId: election.id },
      _count: { candidateId: true },
    });
    const partyVotes = new Map<string, number>();
    const candidatesByParty = new Map<string, Array<{ id: string; citizenId: string; votes: number }>>();
    for (const cand of election.candidacies) {
      if (!cand.partyId) continue;
      const votes = counts.find((c) => c.candidateId === cand.id)?._count.candidateId ?? 0;
      partyVotes.set(cand.partyId, (partyVotes.get(cand.partyId) ?? 0) + votes);
      const list = candidatesByParty.get(cand.partyId) ?? [];
      list.push({ id: cand.id, citizenId: cand.citizenId, votes });
      candidatesByParty.set(cand.partyId, list);
    }

    const seats: string[] = [];
    for (let s = 0; s < CONGRESS_SEATS && partyVotes.size > 0; s++) {
      let best: { party: string; q: number } | null = null;
      for (const [party, votes] of partyVotes) {
        const won = seats.filter((x) => x === party).length;
        const q = votes / (won + 1);
        if (!best || q > best.q) best = { party, q };
      }
      if (!best) break;
      seats.push(best.party);
    }

    await this.prisma.congressSeat.updateMany({ where: { countryId, active: true }, data: { active: false } });
    const perParty = new Map<string, number>();
    for (const party of seats) {
      const taken = perParty.get(party) ?? 0;
      const list = (candidatesByParty.get(party) ?? []).sort((a, b) => b.votes - a.votes);
      const cand = list[taken];
      if (cand) {
        await this.prisma.congressSeat.create({
          data: { countryId, citizenId: cand.citizenId, partyId: party, electedDay: day },
        });
        await this.prisma.$transaction(async (tx2: Tx) => {
          await this.game.applyProgress(tx2, cand.citizenId, XP_WIN_CONGRESS);
          await this.game.awardMedal(tx2, cand.citizenId, "CONGRESS_MEMBER", 5, { day });
        });
      }
      perParty.set(party, taken + 1);
    }
    await this.prisma.election.update({ where: { id: election.id }, data: { status: "CLOSED" } });
  }

  // ===========================================================================
  // LAWS — proposal, vote, tally, execute (24 types)
  // ===========================================================================

  laws(countryId: string, status?: string) {
    return this.prisma.law.findMany({
      where: { countryId, ...(status ? { status: status as never } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async proposeLaw(citizen: { id: string; level: number; citizenshipCountryId: string }, type: string, payload: Record<string, unknown>) {
    const isCongressLaw = CONGRESS_LAWS.has(type);
    const isPresidentLaw = PRESIDENT_LAWS.has(type);
    if (!isCongressLaw && !isPresidentLaw) throw new BadRequestException("unknown law type");

    const country = await this.prisma.country.findUniqueOrThrow({ where: { id: citizen.citizenshipCountryId } });
    const isCP = country.presidentId === citizen.id;
    const memberships = await this.prisma.minister.findMany({ where: { countryId: citizen.citizenshipCountryId, citizenId: citizen.id } });
    const isVice = memberships.some((m) => m.role === "VICE_PRESIDENT");
    const ministerAllowed = memberships.some((m) => (MINISTER_PROPOSABLE[m.role] ?? new Set()).has(type));

    let allowed: boolean;
    let rateCapped = false; // 5 laws per 24h applies to CP and vCP
    if (isPresidentLaw) {
      allowed = isCP || (isVice && (VCP_WAR_LAWS as readonly string[]).includes(type)) || ministerAllowed;
      rateCapped = isCP || isVice;
    } else {
      const congressman = await this.prisma.congressSeat.findFirst({
        where: { citizenId: citizen.id, countryId: citizen.citizenshipCountryId, active: true },
        select: { id: true },
      });
      allowed = !!congressman || ministerAllowed;
    }
    if (!allowed) {
      throw new ForbiddenException(
        isPresidentLaw ? "only the president (or the vCP for war laws, or a minister for their brief) proposes these laws" : "congressmen (or a minister for their brief) propose these laws",
      );
    }
    if (rateCapped) {
      const recent = await this.prisma.law.count({
        where: { countryId: citizen.citizenshipCountryId, proposedById: citizen.id, createdAt: { gt: new Date(Date.now() - 86_400_000) } },
      });
      if (recent >= PRESIDENT_LAWS_PER_DAY) throw new ConflictException("5 laws per 24h limit reached");
    }

    this.validatePayload(type, payload);
    const isEmbargoLaw = type === "MARKETPLACE_EMBARGO" || type === "JOB_EMBARGO" || type === "MONETARY_EMBARGO" || type === "CANCEL_EMBARGO";
    // Embargo laws: 10 gold from the National Organisation; cannot target same-alliance countries (wiki: Embargo).
    if (isEmbargoLaw) {
      const targetId = String(payload.targetCountryId);
      const [actorMembership, targetMembership] = await Promise.all([
        this.prisma.allianceMember.findFirst({ where: { countryId: citizen.citizenshipCountryId }, select: { allianceId: true } }),
        this.prisma.allianceMember.findFirst({ where: { countryId: targetId }, select: { allianceId: true } }),
      ]);
      if (
        type !== "CANCEL_EMBARGO" &&
        actorMembership && targetMembership &&
        actorMembership.allianceId === targetMembership.allianceId
      ) {
        throw new ForbiddenException("cannot embargo a country in the same alliance");
      }
    }
    // Fee and law row are created atomically — a failed creation never keeps the gold.
    return this.prisma.$transaction(async (tx: Tx) => {
      if (isEmbargoLaw) {
        try {
          await this.game.orgGoldMove(tx, citizen.citizenshipCountryId, -GOLD(EMBARGO_COST), { kind: type });
        } catch (e) {
          if (e instanceof Error && e.message === "INSUFFICIENT_ORG_GOLD") {
            throw new BadRequestException(`national organisation lacks ${EMBARGO_COST} gold`);
          }
          throw e;
        }
      }
      if (TREATY_LAWS.has(type)) {
        // NAP is free; MDMA proposal/cancellation costs the country treasury 10g (wiki).
        try {
          await this.game.treasuryMove(tx, citizen.citizenshipCountryId, -GOLD(TREATY_FEE_GOLD), "TREATY_FEE", { kind: type });
        } catch (e) {
          if (e instanceof Error && e.message === "INSUFFICIENT_TREASURY_GOLD") {
            throw new BadRequestException(`country treasury lacks ${TREATY_FEE_GOLD} gold`);
          }
          throw e;
        }
      }
      return tx.law.create({
        data: {
          countryId: citizen.citizenshipCountryId,
          type: type as never,
          payload: payload as Prisma.InputJsonValue,
          proposedById: citizen.id,
          votingEndsAt: new Date(Date.now() + LAW_VOTE_WINDOW_HOURS * 3600_000),
        },
      });
    });
  }

  private validatePayload(type: string, payload: Record<string, unknown>) {
    switch (type) {
      case "CHANGE_TAX": {
        if (!payload.product) throw new BadRequestException("product required");
        const vat = Number(payload.vat ?? 0);
        const imp = Number(payload.importTax ?? 0);
        if (vat < 0 || vat > 95 || imp < 0 || imp > 95) throw new BadRequestException("taxes 0–95%");
        break;
      }
      case "SET_MIN_SALARY":
        if (Number(payload.amount) < 0) throw new BadRequestException("min salary must be ≥ 0");
        break;
      case "PRINT_MONEY": {
        const g = Number(payload.goldInt);
        if (!Number.isInteger(g) || g < PRINT_MONEY_MIN_GOLD || g > PRINT_MONEY_MAX_GOLD) {
          throw new BadRequestException(`gold must be an integer between ${PRINT_MONEY_MIN_GOLD} and ${PRINT_MONEY_MAX_GOLD}`);
        }
        break;
      }
      case "TREASURY_TRANSFER":
        if (!payload.toId) throw new BadRequestException("toId required");
        if (Number(payload.amount) <= 0) throw new BadRequestException("amount must be positive");
        break;
      case "ISSUE_BONDS":
        if (Number(payload.principalGold) <= 0) throw new BadRequestException("principal must be positive");
        break;
      case "DECLARE_WAR":
        if (!payload.defenderCountryId) throw new BadRequestException("defenderCountryId required");
        break;
      case "ATTACK_REGION":
        if (!payload.warId || !payload.regionId) throw new BadRequestException("warId & regionId required");
        break;
      case "CEASEFIRE":
      case "NAP":
      case "PROPOSE_MDMA":
        if (!payload.targetCountryId && !payload.warId) throw new BadRequestException("target required");
        break;
      case "CANCEL_MDMA":
        break;
      case "CREATE_ALLIANCE":
        if (!payload.name) throw new BadRequestException("alliance name required");
        break;
      case "JOIN_ALLIANCE":
      case "LEAVE_ALLIANCE":
        if (!payload.allianceId) throw new BadRequestException("allianceId required");
        break;
      case "RIVAL_COUNTRY":
        if (!payload.targetCountryId) throw new BadRequestException("targetCountryId required");
        break;
      case "MARKETPLACE_EMBARGO":
      case "JOB_EMBARGO":
      case "MONETARY_EMBARGO":
      case "CANCEL_EMBARGO":
        if (!payload.targetCountryId) throw new BadRequestException("targetCountryId required");
        break;
      case "DEPLOY_BUILDING": {
        if (!payload.regionId || !payload.quality) throw new BadRequestException("regionId & quality required");
        const t = String(payload.buildingType ?? "HOSPITAL");
        if (!["HOSPITAL", "FORTIFICATION", "MILITARY_AIR_BASE", "MILITARY_NAVY_BASE"].includes(t)) {
          throw new BadRequestException("building type invalid");
        }
        break;
      }
      case "DEMOLISH_BUILDING":
        if (!payload.regionId) throw new BadRequestException("regionId required");
        break;
      case "REVOKE_CITIZENSHIP":
      case "ELECT_PRESIDENT":
        if (!payload.citizenId) throw new BadRequestException("citizenId required");
        break;
      case "CITIZENSHIP_REQUEST":
        break;
      case "IMPEACH":
        break;
    }
  }

  async voteLaw(citizenId: string, lawId: string, yes: boolean) {
    return this.redis.withLock(`law:${lawId}`, 6000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const seat = await tx.congressSeat.findFirst({ where: { citizenId, active: true } });
        if (!seat) throw new ForbiddenException("congressmen only");
        const law = await tx.law.findUniqueOrThrow({ where: { id: lawId } });
        if (law.status !== "VOTING") throw new ConflictException("voting closed");
        if (law.countryId !== seat.countryId) throw new ForbiddenException("wrong country");
        const existing = await tx.lawVote.findUnique({ where: { lawId_citizenId: { lawId, citizenId } } });
        if (existing) throw new ConflictException("already voted (votes cannot be undone)");
        await tx.lawVote.create({ data: { lawId, citizenId, yes } });
        await tx.law.update({ where: { id: lawId }, data: yes ? { yes: { increment: 1 } } : { no: { increment: 1 } } });
        await this.game.applyProgress(tx, citizenId, XP_PER_LAW_VOTE);
        return { ok: true };
      }),
    );
  }

  // ===========================================================================
  // Citizenship requests (wiki): 30g fee, 1 congress sponsor, majority vote,
  // 10 per target country per month. Paused during Patriot Week.
  // ===========================================================================

  /** Applicant files a citizenship request and pays the non-refundable fee. */
  async applyCitizenship(citizen: { id: string }, toCountryId: string) {
    return this.redis.withLock(`citapp:${citizen.id}`, 6000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const patriot = await tx.specialEvent.findFirst({ where: { type: "PATRIOT_WEEK", status: "ACTIVE" }, select: { id: true } });
        if (patriot) throw new ForbiddenException("Patriot Week: citizenship requests are paused");
        const target = await tx.country.findUnique({ where: { id: toCountryId }, select: { id: true, type: true, active: true } });
        if (!target || !target.active) throw new NotFoundException("target country not found");
        if (target.type !== "PLAYABLE") throw new BadRequestException("only playable countries grant citizenship");
        const me = await tx.citizen.findUniqueOrThrow({ where: { id: citizen.id }, select: { citizenshipCountryId: true } });
        if (me.citizenshipCountryId === toCountryId) throw new BadRequestException("already a citizen of that country");
        const pending = await tx.citizenshipRequest.count({ where: { requesterId: citizen.id, status: "VOTING" } });
        if (pending > 0) throw new ConflictException("you already have a pending citizenship request");
        const monthStart = new Date();
        monthStart.setUTCDate(1);
        monthStart.setUTCHours(0, 0, 0, 0);
        const thisMonth = await tx.citizenshipRequest.count({ where: { toCountryId, createdAt: { gt: monthStart } } });
        if (thisMonth >= CITIZENSHIP_MONTHLY_CAP) {
          throw new ForbiddenException(`citizenship cap reached (${CITIZENSHIP_MONTHLY_CAP} per month)`);
        }
        try {
          await this.game.moveGold(tx, { type: "CITIZEN", id: citizen.id }, null, GOLD(CITIZENSHIP_FEE), "OTHER", { kind: "CITIZENSHIP_FEE", toCountryId });
        } catch (e) {
          if (e instanceof Error && e.message === "INSUFFICIENT_GOLD") throw new BadRequestException(`citizenship fee is ${CITIZENSHIP_FEE} gold`);
          throw e;
        }
        await this.game.treasuryMove(tx, toCountryId, GOLD(CITIZENSHIP_FEE), "OTHER", { kind: "CITIZENSHIP_FEE", fromCitizenId: citizen.id });
        return tx.citizenshipRequest.create({
          data: {
            requesterId: citizen.id,
            fromCountryId: me.citizenshipCountryId,
            toCountryId,
            closesAt: new Date(Date.now() + LAW_VOTE_WINDOW_HOURS * 3600_000),
          },
        });
      }),
    );
  }

  /** A congressman of the TARGET country sponsors the request → opens the congress vote. */
  async sponsorCitizenship(actor: { id: string; citizenshipCountryId: string }, requestId: string) {
    return this.prisma.$transaction(async (tx: Tx) => {
      const req = await tx.citizenshipRequest.findUnique({ where: { id: requestId } });
      if (!req) throw new NotFoundException("citizenship request not found");
      if (req.status !== "VOTING") throw new ConflictException("request is closed");
      if (req.closesAt < new Date()) throw new ConflictException("request expired");
      const seat = await tx.congressSeat.findFirst({
        where: { citizenId: actor.id, countryId: req.toCountryId, active: true },
        select: { id: true },
      });
      if (!seat) throw new ForbiddenException("only a congressman of the target country can sponsor");
      if (req.sponsorId) throw new ConflictException("request already has a sponsor");
      await tx.citizenshipRequest.update({ where: { id: req.id }, data: { sponsorId: actor.id } });
      const law = await tx.law.create({
        data: {
          countryId: req.toCountryId,
          type: "CITIZENSHIP_REQUEST",
          payload: { requesterId: req.requesterId, requestId: req.id } as Prisma.InputJsonValue,
          proposedById: actor.id,
          votingEndsAt: new Date(Date.now() + LAW_VOTE_WINDOW_HOURS * 3600_000),
        },
      });
      return { ok: true, lawId: law.id };
    });
  }

  async sweepExpiredLaws() {
    const laws = await this.prisma.law.findMany({
      where: { status: "VOTING", votingEndsAt: { lt: new Date() } },
      take: 25,
    });
    for (const law of laws) {
      await this.redis.withLock(`law:${law.id}`, 20000, () =>
        this.prisma
          .$transaction(async (tx: Tx) => {
            const fresh = await tx.law.findUniqueOrThrow({ where: { id: law.id } });
            if (fresh.status !== "VOTING") return;
            const seats = await tx.congressSeat.count({ where: { countryId: fresh.countryId, active: true } });
            const threshold = fresh.type === "IMPEACH" || fresh.type === "REVOKE_CITIZENSHIP" ? IMPEACH_THRESHOLD : 0.5;
            const accepted = seats > 0 && fresh.yes / seats > threshold;
            if (!accepted) {
              await tx.law.update({ where: { id: fresh.id }, data: { status: "REJECTED" } });
              if (fresh.type === "CITIZENSHIP_REQUEST") {
                await tx.citizenshipRequest.updateMany({
                  where: { requesterId: String((fresh.payload as Record<string, unknown>).requesterId ?? ""), status: "VOTING" },
                  data: { status: "REJECTED" },
                });
              }
              return;
            }
            await tx.law.update({ where: { id: fresh.id }, data: { status: "ACCEPTED" } });
            await this.executeLaw(tx, fresh);
          })
          .catch(async (e) => {
            // Vote passed but execution failed (e.g. initiative window, empty treasury):
            // mark FAILED so the sweep is not wedged retrying the same law forever.
            await this.prisma.law.updateMany({
              where: { id: law.id, status: { in: ["VOTING", "ACCEPTED"] } },
              data: { status: "FAILED" },
            });
          }),
      );
    }
    return { swept: laws.length };
  }

  private async executeLaw(tx: Tx, law: { id: string; type: string; countryId: string; payload: Prisma.JsonValue; proposedById: string }) {
    const payload = law.payload as Record<string, unknown>;
    switch (law.type) {
      case "CHANGE_TAX": {
        const product = String(payload.product);
        const vat = Math.round(Number(payload.vat ?? 0));
        const importTax = Math.round(Number(payload.importTax ?? 0));
        const existing = await tx.countryTax.findUnique({
          where: { countryId_product: { countryId: law.countryId, product: product as never } },
        });
        if (existing) {
          await tx.countryTax.update({ where: { id: existing.id }, data: { vat, importTax } });
        } else {
          await tx.countryTax.create({ data: { countryId: law.countryId, product: product as never, vat, importTax } });
        }
        break;
      }
      case "SET_MIN_SALARY":
        await tx.country.update({
          where: { id: law.countryId },
          data: { minSalary: BigInt(Math.round(Number(payload.amount) * 100)) },
        });
        break;
      case "PRINT_MONEY": {
        const goldInt = Number(payload.goldInt);
        await this.game.treasuryMove(tx, law.countryId, -GOLD(goldInt), "PRINT_MONEY");
        const fiatCents = BigInt(Math.round((goldInt / PRINT_MONEY_GOLD_PER_CC) * 100));
        await this.game.treasuryFiatCredit(tx, law.countryId, fiatCents, "PRINT_MONEY");
        break;
      }
      case "TREASURY_TRANSFER": {
        const asset = String(payload.asset ?? "GOLD") === "FIAT" ? "FIAT" : "GOLD";
        const cents = BigInt(Math.round(Number(payload.amount) * 100));
        if (asset === "GOLD") {
          await this.game.treasuryMove(tx, law.countryId, -cents, "TREASURY_TRANSFER");
          if (String(payload.toType ?? "CITIZEN") === "MILITARY_UNIT") {
            await tx.militaryUnit.update({ where: { id: String(payload.toId) }, data: { gold: { increment: cents } } });
          } else {
            await tx.citizen.update({ where: { id: String(payload.toId) }, data: { gold: { increment: cents } } });
          }
        } else {
          const res = await tx.country.updateMany({
            where: { id: law.countryId, treasuryFiat: { gte: cents } },
            data: { treasuryFiat: { decrement: cents } },
          });
          if (res.count === 0) throw new BadRequestException("treasury lacks fiat");
          await tx.citizenWallet.upsert({
            where: { citizenId_countryId: { citizenId: String(payload.toId), countryId: law.countryId } },
            create: { citizenId: String(payload.toId), countryId: law.countryId, amount: cents },
            update: { amount: { increment: cents } },
          });
        }
        break;
      }
      case "ISSUE_BONDS": {
        const principal = GOLD(Number(payload.principalGold));
        const holderId = String(payload.holderId ?? law.proposedById);
        await this.game.moveGold(tx, { type: "CITIZEN", id: holderId }, null, principal, "BOND_ISSUE");
        await this.game.treasuryMove(tx, law.countryId, principal, "BOND_ISSUE");
        const day = await this.game.currentDay();
        await tx.bond.create({
          data: {
            countryId: law.countryId,
            holderId,
            principal,
            interest: (principal * BigInt(5)) / BigInt(100),
            issuedDay: day,
            redeemDay: day + 15,
          },
        });
        break;
      }
      case "DECLARE_WAR":
      case "ATTACK_REGION":
        await this.wars.executeLaw(tx, law.type as never, payload as Record<string, unknown>, law.countryId);
        break;
      case "CEASEFIRE": {
        const warId = String(payload.warId);
        await tx.war.update({ where: { id: warId }, data: { status: "ENDED", endedAt: new Date() } });
        break;
      }
      case "NAP": {
        const target = String(payload.targetCountryId);
        await tx.treaty.create({ data: { type: "NAP", countryAId: law.countryId, countryBId: target } });
        break;
      }
      case "CREATE_ALLIANCE": {
        const alliance = await tx.alliance.create({ data: { name: String(payload.name), leaderId: law.countryId } });
        await tx.allianceMember.create({ data: { allianceId: alliance.id, countryId: law.countryId } });
        break;
      }
      case "JOIN_ALLIANCE": {
        const allianceId = String(payload.allianceId);
        const count = await tx.allianceMember.count({ where: { allianceId } });
        if (count >= 5) throw new BadRequestException("alliance max 5 members");
        await tx.allianceMember.create({ data: { allianceId, countryId: law.countryId } });
        break;
      }
      case "LEAVE_ALLIANCE": {
        await tx.allianceMember.deleteMany({ where: { allianceId: String(payload.allianceId), countryId: law.countryId } });
        break;
      }
      case "PROPOSE_MDMA": {
        const target = String(payload.targetCountryId);
        await tx.treaty.create({ data: { type: "MDMA", countryAId: law.countryId, countryBId: target } });
        break;
      }
      case "CANCEL_MDMA": {
        await tx.treaty.updateMany({ where: { type: "MDMA", active: true, OR: [{ countryAId: law.countryId }, { countryBId: law.countryId }] }, data: { active: false } });
        break;
      }
      case "RIVAL_COUNTRY": {
        const target = String(payload.targetCountryId);
        await tx.country.update({
          where: { id: law.countryId },
          data: { rivalOf: target, rivalUntil: new Date(Date.now() + ELECTION_CYCLE_DAYS * 86_400_000) },
        });
        break;
      }
      case "DEPLOY_BUILDING": {
        const regionId = String(payload.regionId);
        const quality = Math.min(5, Math.max(1, Number(payload.quality)));
        const type = String(payload.buildingType ?? "HOSPITAL") as "HOSPITAL" | "FORTIFICATION" | "MILITARY_AIR_BASE" | "MILITARY_NAVY_BASE";
        const took = await tx.storage.updateMany({
          where: { ownerType: "COUNTRY", ownerId: law.countryId, product: type, quality, quantity: { gte: 1 } },
          data: { quantity: { decrement: 1 } },
        });
        if (took.count === 0) throw new BadRequestException("treasury lacks the building item");
        await tx.regionBuilding.upsert({
          where: { regionId_type: { regionId, type: type as never } },
          create: { regionId, type: type as never, quality },
          update: { quality },
        });
        if (type === "MILITARY_AIR_BASE" || type === "MILITARY_NAVY_BASE") {
          await tx.region.update({
            where: { id: regionId },
            data: { attackCooldownUntil: new Date(Date.now() + 3600_000) },
          });
        }
        break;
      }
      case "DEMOLISH_BUILDING": {
        const regionId = String(payload.regionId);
        const type = String(payload.buildingType ?? "HOSPITAL");
        await tx.regionBuilding.deleteMany({ where: { regionId, type: type as never } });
        break;
      }
      case "IMPEACH": {
        await tx.country.update({ where: { id: law.countryId }, data: { presidentId: null } });
        // Succession: the vCP takes over; otherwise the last presidential election's runner-up.
        const vice = await tx.minister.findFirst({ where: { countryId: law.countryId, role: "VICE_PRESIDENT" }, select: { citizenId: true } });
        if (vice && vice.citizenId !== law.proposedById) {
          await tx.country.update({ where: { id: law.countryId }, data: { presidentId: vice.citizenId } });
          await tx.minister.delete({ where: { countryId_role: { countryId: law.countryId, role: "VICE_PRESIDENT" } } });
          break;
        }
        const lastElection = await tx.election.findFirst({
          where: { countryId: law.countryId, type: "PRESIDENTIAL", status: "CLOSED" },
          orderBy: { day: "desc" },
          include: { candidacies: true },
        });
        if (lastElection) {
          const counts = await tx.vote.groupBy({
            by: ["candidateId"],
            where: { electionId: lastElection.id },
            _count: { candidateId: true },
          });
          const ranked = counts.sort((a, b) => b._count.candidateId - a._count.candidateId);
          const nextCand = lastElection.candidacies.find((c) => c.id === ranked[0]?.candidateId && c.citizenId !== law.proposedById);
          if (nextCand) {
            await tx.country.update({ where: { id: law.countryId }, data: { presidentId: nextCand.citizenId } });
          }
        }
        break;
      }
      case "ELECT_PRESIDENT": {
        await tx.country.update({ where: { id: law.countryId }, data: { presidentId: String(payload.citizenId) } });
        break;
      }
      case "REVOKE_CITIZENSHIP": {
        const targetId = String(payload.citizenId);
        const native = await tx.citizen.findUniqueOrThrow({ where: { id: targetId }, select: { citizenshipCountryId: true } });
        // Revoke back to native country — v1: keep citizenship, flag notification.
        await this.game.notify(tx, targetId, "CITIZENSHIP_REVOKED", { country: native.citizenshipCountryId });
        break;
      }
      case "CITIZENSHIP_REQUEST": {
        // Executed when a request law passes: move citizenship (30g fee enforced at candidacy).
        const targetId = String(payload.requesterId);
        await tx.citizen.update({ where: { id: targetId }, data: { citizenshipCountryId: law.countryId } });
        await tx.citizenshipRequest.updateMany({
          where: { requesterId: targetId, toCountryId: law.countryId, status: "VOTING" },
          data: { status: "ACCEPTED" },
        });
        break;
      }
      case "MARKETPLACE_EMBARGO":
      case "JOB_EMBARGO":
      case "MONETARY_EMBARGO": {
        const target = String(payload.targetCountryId);
        await tx.embargo.create({
          data: {
            sourceCountryId: law.countryId,
            targetCountryId: target,
            type: law.type.replace("_EMBARGO", "") as never,
            until: new Date(Date.now() + EMBARGO_DAYS * 86_400_000),
          },
        });
        await this.enforceEmbargo(tx, law.countryId, target, law.type.replace("_EMBARGO", ""));
        break;
      }
      case "CANCEL_EMBARGO": {
        const target = String(payload.targetCountryId);
        await tx.embargo.updateMany({
          where: { sourceCountryId: law.countryId, targetCountryId: target, active: true },
          data: { active: false },
        });
        break;
      }
    }
    await tx.law.update({ where: { id: law.id }, data: { status: "EXECUTED", executedAt: new Date() } });
  }

  /** Embargo enforcement effects at execution time (wiki: all existing offers removed). */
  private async enforceEmbargo(tx: Tx, _sourceId: string, targetId: string, type: string) {
    if (type === "MARKETPLACE") {
      // Remove ALL active product offers by target citizens and refund the escrowed stock.
      const targetCitizens = await tx.citizen.findMany({ where: { citizenshipCountryId: targetId }, select: { id: true } });
      for (const c of targetCitizens) {
        const offers = await tx.productOffer.findMany({ where: { ownerId: c.id, active: true } });
        for (const o of offers) {
          await tx.productOffer.update({ where: { id: o.id }, data: { active: false } });
          await this.game.addStorage(tx, "CITIZEN", c.id, o.product, o.quality, o.remaining);
        }
      }
    }
    if (type === "JOB") {
      // Fire target-country workers everywhere and remove the job offers of target-country company owners (wiki: Job embargo).
      await tx.employment.updateMany({
        where: { active: true, citizen: { citizenshipCountryId: targetId } },
        data: { active: false },
      });
      const targetCitizenIds = (await tx.citizen.findMany({ where: { citizenshipCountryId: targetId }, select: { id: true } })).map((c) => c.id);
      const targetCompanies = await tx.company.findMany({ where: { ownerId: { in: targetCitizenIds } }, select: { id: true } });
      for (const co of targetCompanies) {
        await tx.jobOffer.updateMany({ where: { companyId: co.id, active: true }, data: { active: false } });
        await tx.employment.updateMany({ where: { companyId: co.id, active: true }, data: { active: false } });
      }
    }
    if (type === "MONETARY") {
      const targetCitizens = await tx.citizen.findMany({ where: { citizenshipCountryId: targetId }, select: { id: true } });
      for (const c of targetCitizens) {
        const fx = await tx.monetaryOffer.findMany({ where: { ownerId: c.id, active: true } });
        for (const o of fx) {
          await tx.monetaryOffer.update({ where: { id: o.id }, data: { active: false } });
          if (o.sellAsset === "GOLD") {
            await this.game.moveGold(tx, null, { type: "CITIZEN", id: c.id }, o.remaining, "OTHER");
          } else {
            await this.game.walletCredit(tx, c.id, o.sellCountryId ?? "", o.remaining, "OTHER");
          }
        }
      }
    }
  }

  async getCountryBroadcast(countryId: string) {
    if (!countryId) return { broadcast: null };
    const country = await this.prisma.country.findUnique({
      where: { id: countryId },
      select: {
        broadcastMessage: true,
        broadcastExpiresAt: true,
        president: { select: { id: true, nickname: true, avatarColor: true } },
      },
    });
    if (!country || !country.broadcastMessage || !country.broadcastExpiresAt) {
      return { broadcast: null };
    }
    if (new Date(country.broadcastExpiresAt) < new Date()) {
      return { broadcast: null };
    }
    return {
      broadcast: {
        message: country.broadcastMessage,
        expiresAt: country.broadcastExpiresAt,
        president: country.president,
      },
    };
  }

  async setCountryBroadcast(
    citizen: { id: string; citizenshipCountryId: string },
    message: string,
  ) {
    if (!message || message.trim().length === 0) {
      throw new BadRequestException("Broadcast message cannot be empty");
    }
    if (message.length > 500) {
      throw new BadRequestException("Broadcast message must be under 500 characters");
    }
    const country = await this.prisma.country.findUniqueOrThrow({
      where: { id: citizen.citizenshipCountryId },
    });
    if (country.presidentId !== citizen.id) {
      throw new ForbiddenException("Only the Country President can broadcast a message to citizens");
    }
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    await this.prisma.country.update({
      where: { id: country.id },
      data: {
        broadcastMessage: message.trim(),
        broadcastExpiresAt: expiresAt,
      },
    });
    return { ok: true, message: message.trim(), expiresAt };
  }
}
