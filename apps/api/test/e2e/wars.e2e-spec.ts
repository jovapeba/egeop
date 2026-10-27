import {
  api,
  countryByCode,
  expireRounds,
  passLaw,
  prisma,
  register,
  setGold,
  setHp,
  setLevel,
  sweepWars,
} from "./helpers";

const HP_MAX = 500;

/** Sets a user up as president of their country (direct DB fixture). */
async function makePresident(c: { id: string; countryId: string }) {
  await prisma.country.update({ where: { id: c.countryId }, data: { presidentId: c.id } });
}

async function fundTreasury(countryId: string, gold: number) {
  await prisma.country.update({ where: { id: countryId }, data: { treasuryGold: BigInt(gold * 100) } });
}

describe("wars: declare → attack → conquer (E2E)", () => {
  it(
    "runs a full direct war: law votes, 8 battle rounds, region transfer",
    async () => {
      const usa = await countryByCode("US");
      const mexico = await countryByCode("MX");

      const president = await register("potus", usa!.id);
      await makePresident(president);
      await fundTreasury(usa!.id, 10_000);
      await setLevel(president.id, 20);

      // --- declare (president → DECLARE_WAR law, 48h vote) ----------------
      const warLaw = await api<{ id: string; type: string; status: string }>("/wars/declare", {
        method: "POST",
        token: president.token,
        body: { defenderCountryId: mexico!.id },
      });
      expect(warLaw.type).toBe("DECLARE_WAR");
      expect(warLaw.status).toBe("VOTING");

      // non-president cannot declare
      const civi = await register("civiwar", usa!.id);
      await expect(
        api("/wars/declare", { method: "POST", token: civi.token, body: { defenderCountryId: mexico!.id } }),
      ).rejects.toMatchObject({ status: 403 });

      await passLaw(warLaw.id);
      const wars = await api<Array<{ id: string; type: string; status: string; attackerWins: number }>>("/wars", {
        token: president.token,
      });
      const active = wars.find((w) => w.status === "ACTIVE" && w.type === "DIRECT");
      expect(active).toBeTruthy();
      expect(active!.attackerWins).toBe(0);

      // --- attack a Mexican region that actually borders the US -----------
      const mexRegion = await prisma.region.findFirst({
        where: {
          countryId: mexico!.id,
          OR: [
            { neighborsA: { some: { b: { countryId: usa!.id } } } },
            { neighborsB: { some: { a: { countryId: usa!.id } } } },
          ],
        },
      });
      const attackLaw = await api<{ id: string }>("/wars/attack", {
        method: "POST",
        token: president.token,
        body: { warId: active!.id, regionId: mexRegion!.id },
      });
      await passLaw(attackLaw.id);

      let battle = await prisma.battle.findFirstOrThrow({ where: { warId: active!.id, status: "ACTIVE" } });
      expect(battle.status).toBe("ACTIVE");
      const freshWar = await prisma.war.findUniqueOrThrow({ where: { id: active!.id } });
      expect(freshWar.attackerWins + freshWar.defenderWins).toBe(0);

      // --- fight 8 rounds: attacker alone wins each, war ends -------------
      let fightRes: any = null;
      for (let round = 1; round <= 8; round++) {
        // make sure a round is live (executor creates round 1; sweeps create the rest)
        let roundRow = await prisma.round.findFirst({ where: { battleId: battle.id, status: "ACTIVE" } });
        if (!roundRow) {
          await api(`/wars/battles/${battle.id}`, { token: president.token }).catch(() => null);
          roundRow = await prisma.round.findFirst({ where: { battleId: battle.id, status: "ACTIVE" } });
        }
        expect(roundRow).toBeTruthy();

        await setHp(president.id, HP_MAX);
        // 12.5% base miss chance — retry until the hit lands (max 5 swings/round)
        let landed = false;
        for (let swing = 0; swing < 5 && !landed; swing++) {
          fightRes = await api<{ totalDamage: number }>(`/wars/battles/${battle.id}/fight`, {
            method: "POST",
            token: president.token,
            body: { side: "ATTACKER", mode: "SINGLE" },
          });
          landed = fightRes.totalDamage > 0;
        }
        expect(landed).toBe(true);

        // expire the round → sweep finalizes (defender absent → attacker wins)
        await expireRounds(battle.id);
        await sweepWars();

        const after = await prisma.war.findUniqueOrThrow({ where: { id: active!.id } });
        if (round < 8) expect(after.attackerWins).toBe(round);
      }

      // --- war ended 8:0, region conquered --------------------------------
      const finished = await prisma.battle.findUniqueOrThrow({ where: { id: battle.id } });
      expect(finished.status).toBe("ENDED");

      const warRow = await prisma.war.findUniqueOrThrow({ where: { id: active!.id } });
      expect(warRow.status).toBe("ENDED");

      const conquered = await prisma.region.findUniqueOrThrow({ where: { id: mexRegion!.id } });
      expect(conquered.countryId).toBe(usa!.id); // sovereignty transferred
      expect(conquered.coreCountryId).toBe(mexico!.id); // core stays Mexican (RW eligibility)
    },
    240_000,
  );
});

describe("wars: training yard (E2E)", () => {
  it("opens an on-demand yard war and caps damage by military rank", async () => {
    const c = await register("rookie", undefined);
    await setLevel(c.id, 5);
    await setHp(c.id, HP_MAX);

    // visiting the training page opens the yard on demand
    const yard = await api<Record<string, unknown>>("/wars/training", { token: c.token });
    expect(yard).toBeTruthy();

    // find the yard battle for the citizen's country
    const tma = await prisma.country.findFirstOrThrow({ where: { name: { contains: "Team Alpha" } } });
    const yardWar = await prisma.war.findFirstOrThrow({
      where: { status: "ACTIVE", OR: [{ attackerCountryId: tma.id }, { defenderCountryId: tma.id }] },
      orderBy: { startedAt: "desc" },
    });
    const battle = await prisma.battle.findFirstOrThrow({ where: { warId: yardWar.id, status: "ACTIVE" } });

    // Civil rank (0 total damage) caps damage at 100; 12.5% base miss → retry swings
    let maxSeen = 0;
    for (let swing = 0; swing < 5; swing++) {
      const res = await api<{ totalDamage: number }>(`/wars/battles/${battle.id}/fight`, {
        method: "POST",
        token: c.token,
        body: { side: "ATTACKER", mode: "SINGLE" },
      });
      maxSeen = Math.max(maxSeen, res.totalDamage);
      if (maxSeen > 0) break;
    }
    expect(maxSeen).toBeGreaterThan(0);
    expect(maxSeen).toBeLessThanOrEqual(100);
  });

  it("keeps the yard open during Patriot Week (special event block does not apply)", async () => {
    const c = await register("patriot");
    const yard = await api<Record<string, unknown>>("/wars/training", { token: c.token });
    expect(yard).toBeTruthy();
  });
});

describe("wars: access control (E2E)", () => {
  it("fighting without a token is unauthorized", async () => {
    await expect(api("/wars/battles/whatever/fight", { method: "POST", body: { side: "ATTACKER", mode: "SINGLE" } })).rejects.toMatchObject({ status: 401 });
  });

  it("GET /wars is public to logged-in users", async () => {
    const c = await register("warwatcher");
    const wars = await api<unknown[]>("/wars", { token: c.token });
    expect(Array.isArray(wars)).toBe(true);
  });
});
