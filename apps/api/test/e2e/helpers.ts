/**
 * Shared E2E helpers: HTTP client, auth shortcuts, direct-DB test setup
 * (seeding money/items/time-travel — actions under test always go via HTTP).
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

export interface E2eState {
  port: number;
  dbUrl: string;
  pid: number;
  logFile: string;
}

const STATE_FILE = path.join(__dirname, ".e2e-state.json");
export const state: E2eState = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
export const API = `http://127.0.0.1:${state.port}`;
export const prisma = new PrismaClient({ datasourceUrl: state.dbUrl });

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: unknown = null,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  p: string,
  o: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const res = await fetch(API + p, {
    method: o.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(o.token ? { Authorization: `Bearer ${o.token}` } : {}),
    },
    body: o.body === undefined ? undefined : JSON.stringify(o.body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = Array.isArray(json?.message) ? json.message.join(", ") : (json?.message ?? res.statusText);
    throw new ApiError(res.status, msg, json);
  }
  return json as T;
}

/** Golden minor units: g(1.5) === 150 */
export const g = (v: number) => BigInt(Math.round(v * 100));

// ---------------------------------------------------------------------------
// Auth shortcuts
// ---------------------------------------------------------------------------
export const DEMO1 = { email: "demo1@egeopolis.dev", password: "demo1234" };
export const STAFF = { email: "staff@egeopolis.dev", password: "staff1234" };

export async function login(email: string, password: string): Promise<string> {
  const r = await api<{ accessToken: string }>("/auth/login", { method: "POST", body: { email, password } });
  return r.accessToken;
}

let staffTok: string | null = null;
/** The staff account is bootstrapped by global-setup (seed only creates demo users). */
export async function staffToken(): Promise<string> {
  if (!staffTok) staffTok = await login(STAFF.email, STAFF.password);
  return staffTok;
}

export interface TestCitizen {
  email: string;
  password: string;
  token: string;
  id: string;
  nickname: string;
  countryId: string;
  level: number;
}

/** Registers a fresh citizen (unique nickname/email per call) and logs in. */
export async function register(nickname: string, countryId?: string): Promise<TestCitizen> {
  const email = `${nickname.toLowerCase()}_${Date.now()}_${Math.floor(Math.random() * 1e4)}@e2e.test`;
  await api("/auth/register", {
    method: "POST",
    body: { email, password: "test1234", nickname, countryId },
  });
  const token = await login(email, "test1234");
  const me = await api<any>("/auth/me", { token });
  return {
    email,
    password: "test1234",
    token,
    id: me.id,
    nickname: me.nickname,
    countryId: me.citizenshipCountryId,
    level: me.level,
  };
}

// ---------------------------------------------------------------------------
// Direct-DB test setup (deterministic fixtures / time travel)
// ---------------------------------------------------------------------------
export async function setGold(citizenId: string, gold: number) {
  await prisma.citizen.update({ where: { id: citizenId }, data: { gold: g(gold) } });
}

export async function setHp(citizenId: string, hp: number) {
  await prisma.citizen.update({ where: { id: citizenId }, data: { hp } });
}

export async function setLevel(citizenId: string, level: number) {
  await prisma.citizen.update({ where: { id: citizenId }, data: { level } });
}

/** Grant storage items (e.g. TICKET/FOOD/AMMO) directly. */
export async function giveStorage(citizenId: string, product: string, quality: number, quantity: number) {
  const existing = await prisma.storage.findUnique({
    where: {
      ownerType_ownerId_product_quality: {
        ownerType: "CITIZEN",
        ownerId: citizenId,
        product: product as never,
        quality,
      },
    },
  });
  if (existing) {
    await prisma.storage.update({ where: { id: existing.id }, data: { quantity: BigInt(quantity) } });
  } else {
    await prisma.storage.create({
      data: { ownerType: "CITIZEN", ownerId: citizenId, product: product as never, quality, quantity: BigInt(quantity) },
    });
  }
}

export async function makeCongressman(citizenId: string, countryId: string) {
  await prisma.congressSeat.create({ data: { countryId, citizenId, electedDay: 1, active: true } });
}

/** Fast-track a law: fake a super-majority, expire the vote window, sweep. */
export async function passLaw(lawId: string) {
  await prisma.law.update({
    where: { id: lawId },
    data: { yes: 99, no: 0, votingEndsAt: new Date(Date.now() - 1000) },
  });
  await sweepPolitics();
}

export async function sweepPolitics() {
  await api("/politics/dev-sweep", { method: "POST", token: await staffToken() });
}

export async function sweepWars() {
  await api("/wars/dev-sweep", { method: "POST", token: await staffToken() });
}

/** Expire every ACTIVE round of a battle so the next dev-sweep finalizes them. */
export async function expireRounds(battleId: string) {
  await prisma.round.updateMany({ where: { battleId, status: "ACTIVE" }, data: { endsAt: new Date(Date.now() - 1000) } });
}

export async function countryByCode(code: string) {
  return prisma.country.findUnique({ where: { code } });
}

export async function regionWithResource(countryId: string, resource: string) {
  return prisma.region.findFirst({ where: { countryId, resource: resource as never, NOT: { density: "NONE" } } });
}
