import {
  api,
  countryByCode,
  makeCongressman,
  passLaw,
  prisma,
  register,
  setGold,
  sweepPolitics,
} from "./helpers";

describe("politics: laws (E2E)", () => {
  it("only congressmen propose congress laws (403 for citizens)", async () => {
    const c = await register("lawless");
    await expect(
      api("/politics/laws", { method: "POST", token: c.token, body: { type: "PRINT_MONEY", payload: { amountGold: 100 } } }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("a congress law passes with a majority and executes (PRINT_MONEY prints fiat)", async () => {
    const usa = await countryByCode("US");
    const author = await register("lawmaker", usa!.id);
    await makeCongressman(author.id, usa!.id);
    // PRINT_MONEY burns treasury GOLD to mint fiat (0.005 g/CC)
    await prisma.country.update({ where: { id: usa!.id }, data: { treasuryGold: BigInt(100_000) } });

    const before = await prisma.country.findUniqueOrThrow({ where: { id: usa!.id } });
    const law = await api<{ id: string; status: string }>("/politics/laws", {
      method: "POST",
      token: author.token,
      body: { type: "PRINT_MONEY", payload: { goldInt: 250 } },
    });
    expect(law.status).toBe("VOTING");

    await passLaw(law.id);

    const executed = await prisma.law.findUniqueOrThrow({ where: { id: law.id } });
    expect(executed.status).toBe("EXECUTED");

    const after = await prisma.country.findUniqueOrThrow({ where: { id: usa!.id } });
    // 250g burned → 250 / 0.005 = 50,000 CC = 5,000,000 minor fiat minted
    expect(Number(before.treasuryFiat) + 5_000_000).toBe(Number(after.treasuryFiat));
    expect(Number(after.treasuryGold)).toBe(Number(before.treasuryGold) - 25_000);
  });

  it("laws without a majority expire as REJECTED", async () => {
    const usa = await countryByCode("US");
    const author = await register("minority", usa!.id);
    await makeCongressman(author.id, usa!.id);

    const law = await api<{ id: string }>("/politics/laws", {
      method: "POST",
      token: author.token,
      body: { type: "PRINT_MONEY", payload: { goldInt: 100 } },
    });
    // no votes, window expires
    await prisma.law.update({ where: { id: law.id }, data: { votingEndsAt: new Date(Date.now() - 1000) } });
    await sweepPolitics();

    const rejected = await prisma.law.findUniqueOrThrow({ where: { id: law.id } });
    expect(rejected.status).toBe("REJECTED");
  });

  it("GET /politics/laws lists laws", async () => {
    const usa = await countryByCode("US");
    const c = await register("watcher", usa!.id);
    const laws = await api<unknown[]>(`/politics/laws?countryId=${usa!.id}`, { token: c.token });
    expect(Array.isArray(laws)).toBe(true);
  });
});

describe("politics: citizenship requests (E2E)", () => {
  it("charges 30g, needs a sponsor and a passing law to move citizenship", async () => {
    const albania = await countryByCode("AL");
    const usa = await countryByCode("US");
    const applicant = await register("migrant", albania!.id);
    await setGold(applicant.id, 100);

    // US congressmen only — Albanian congressman cannot sponsor (403)
    const usRep = await register("sponsor", usa!.id);
    await makeCongressman(usRep.id, usa!.id);

    const req = await api<{ id: string; status: string }>("/politics/citizenship", {
      method: "POST",
      token: applicant.token,
      body: { toCountryId: usa!.id },
    });
    // citizenship request opens in VOTING state
    expect(req.status).toBe("VOTING");

    const afterFee = await prisma.citizen.findUniqueOrThrow({ where: { id: applicant.id } });
    expect(Number(afterFee.gold)).toBe(7000); // 100g − 30g fee

    await api(`/politics/citizenship/${req.id}/sponsor`, { method: "POST", token: usRep.token });
    const law = await prisma.law.findFirstOrThrow({
      where: { type: "CITIZENSHIP_REQUEST", countryId: usa!.id, status: "VOTING" },
      orderBy: { createdAt: "desc" },
    });

    await passLaw(law.id);

    const request = await prisma.citizenshipRequest.findUniqueOrThrow({ where: { id: req.id } });
    expect(request.status).toBe("ACCEPTED");

    const me = await api<any>("/auth/me", { token: applicant.token });
    expect(me.citizenshipCountry.id).toBe(usa!.id);
  });

  it("blocks a second application while one is pending (409)", async () => {
    const albania = await countryByCode("AL");
    const greece = await countryByCode("GR");
    const usa = await countryByCode("US");
    const applicant = await register("serialmigrant", albania!.id);
    await setGold(applicant.id, 200);
    await api("/politics/citizenship", { method: "POST", token: applicant.token, body: { toCountryId: greece!.id } });
    await expect(
      api("/politics/citizenship", { method: "POST", token: applicant.token, body: { toCountryId: usa!.id } }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("politics: read endpoints (E2E)", () => {
  it("parties / elections / treasury / alliances / cabinet respond", async () => {
    const usa = await countryByCode("US");
    const c = await register("polwatcher", usa!.id);
    const q = `?countryId=${usa!.id}`;
    for (const path of [`/politics/parties${q}`, `/politics/elections${q}`, `/politics/treasury${q}`, "/politics/alliances", `/politics/cabinet${q}`, `/politics/org${q}`]) {
      const res = await api<unknown>(path, { token: c.token });
      expect(res).toBeDefined();
    }
  });
});
