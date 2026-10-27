import { ApiError, api, DEMO1, login, prisma, register } from "./helpers";

describe("auth (E2E)", () => {
  it("GET /auth/countries is public and lists the world", async () => {
    const countries = await api<Array<{ code: string; name: string }>>("/auth/countries");
    expect(countries.length).toBeGreaterThanOrEqual(60);
    expect(countries.some((c) => c.code === "US")).toBe(true);
  });

  it("rejects wrong credentials with 401", async () => {
    await expect(login(DEMO1.email, "wrong-password")).rejects.toMatchObject({ status: 401 });
  });

  it("registers a fresh citizen with starter wallet + gold", async () => {
    const c = await register("authuser");
    expect(c.nickname).toBe("authuser");
    expect(c.level).toBe(1);
    const me = await api<any>("/auth/me", { token: c.token });
    expect(Number(me.gold)).toBe(5000); // STARTER_GOLD = 50g
    expect(me.walletFiat).toBe(50000); // 500 CC home-currency wallet
    expect(me.locationRegion?.id).toBeTruthy();
  });

  it("hides passwordHash on /auth/me and profiles", async () => {
    const token = await login(DEMO1.email, DEMO1.password);
    const me = await api<Record<string, unknown>>("/auth/me", { token });
    expect(me).not.toHaveProperty("passwordHash");

    const demo2 = await prisma.citizen.findFirstOrThrow({ where: { email: "demo2@egeopolis.dev" } });
    const profile = await api<Record<string, unknown>>(`/citizens/${demo2.id}`, { token });
    expect(profile).not.toHaveProperty("passwordHash");
  });

  it("blocks duplicate email/nickname registration (409)", async () => {
    await expect(
      api("/auth/register", {
        method: "POST",
        body: { email: DEMO1.email, password: "test1234", nickname: `uniq_${Date.now()}` },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("validates nickname format (400)", async () => {
    await expect(
      api("/auth/register", {
        method: "POST",
        body: { email: `bad_${Date.now()}@e2e.test`, password: "test1234", nickname: "bad nickname!" },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("requires a JWT for protected endpoints (401)", async () => {
    await expect(api("/auth/me")).rejects.toMatchObject({ status: 401 });
  });

  it("PATCH /citizens/me/settings persists guide + shortcuts", async () => {
    const c = await register("settingsuser");
    await api("/citizens/me/settings", {
      method: "PATCH",
      token: c.token,
      body: { guide: "MAN", shortcuts: ["wars", "market"] },
    });
    const me = await api<any>("/auth/me", { token: c.token });
    expect(me.guide ?? me.settings?.guide).toBe("MAN");
  });

  it("updates avatar color via settings", async () => {
    const c = await register("avataruser");
    await api("/citizens/me/settings", { method: "PATCH", token: c.token, body: { avatarColor: "#12abef" } });
    const me = await api<any>("/auth/me", { token: c.token });
    expect(me.avatarColor).toBe("#12abef");
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
