/**
 * Shared Playwright E2E helpers: a fetch client against the isolated API
 * (port 3011, nationforge_e2e DB) plus direct-DB fixtures for deterministic
 * test setup. Actions under test always go through the real UI.
 */
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const API_DIR = path.resolve(__dirname, "..", "..", "api");

function readDotenv(): Record<string, string> {
  const raw = fs.readFileSync(path.join(API_DIR, ".env"), "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#")) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const DB_NAME = "nationforge_e2e";
const base = readDotenv();
export const DB_URL = base.DATABASE_URL.replace(/(\/\/[^/]+)\/[^/?]+(\?.*)?$/, `$1/${DB_NAME}$2`);
export const API = "http://127.0.0.1:3011";
export const prisma = new PrismaClient({ datasourceUrl: DB_URL });

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

// ---------------------------------------------------------------------------
// Accounts & tokens
// ---------------------------------------------------------------------------
export const DEMO1 = { email: "demo1@egeopolis.dev", password: "demo1234" };
export const DEMO2 = { email: "demo2@egeopolis.dev", password: "demo1234" };
export const STAFF = { email: "staff@egeopolis.dev", password: "staff1234" };

export async function login(email: string, password: string): Promise<string> {
  const r = await api<{ accessToken: string }>("/auth/login", { method: "POST", body: { email, password } });
  return r.accessToken;
}

let demo2Tok: string | null = null;
export async function demo2Token(): Promise<string> {
  if (!demo2Tok) demo2Tok = await login(DEMO2.email, DEMO2.password);
  return demo2Tok;
}

let demo1Tok: string | null = null;
export async function demo1Token(): Promise<string> {
  if (!demo1Tok) demo1Tok = await login(DEMO1.email, DEMO1.password);
  return demo1Tok;
}

let staffTok: string | null = null;
export async function staffToken(): Promise<string> {
  if (!staffTok) staffTok = await login(STAFF.email, STAFF.password);
  return staffTok;
}

export async function meId(token: string): Promise<string> {
  const me = await api<{ id: string }>("/auth/me", { token });
  return me.id;
}

let demo1IdCache: string | null = null;
export async function demo1Id(): Promise<string> {
  if (!demo1IdCache) demo1IdCache = await meId(await login(DEMO1.email, DEMO1.password));
  return demo1IdCache;
}

let demo1NickCache: string | null = null;
export async function demo1Nickname(): Promise<string> {
  if (!demo1NickCache) {
    const me = await api<{ nickname: string }>("/auth/me", { token: await login(DEMO1.email, DEMO1.password) });
    demo1NickCache = me.nickname;
  }
  return demo1NickCache;
}

let demo2NickCache: string | null = null;
export async function demo2Nickname(): Promise<string> {
  if (!demo2NickCache) {
    const me = await api<{ nickname: string }>("/auth/me", { token: await demo2Token() });
    demo2NickCache = me.nickname;
  }
  return demo2NickCache;
}

/** Unique suffix so re-runs against a fresh DB never collide on unique names. */
export const uniq = () => Math.random().toString(36).slice(2, 8);

// ---------------------------------------------------------------------------
// Direct-DB fixtures (test setup only — game actions always go via HTTP/UI)
// ---------------------------------------------------------------------------
/** Golden minor units: g(1.5) === 150 */
export const g = (v: number) => BigInt(Math.round(v * 100));

export async function setGold(citizenId: string, gold: number) {
  await prisma.citizen.update({ where: { id: citizenId }, data: { gold: g(gold) } });
}

export async function setHp(citizenId: string, hp: number) {
  await prisma.citizen.update({ where: { id: citizenId }, data: { hp } });
}

/** Grant storage items (FOOD/AMMO/TICKET/…) directly. */
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

/** Seed a company's raw-material storage (quality 0) so shifts can produce. */
export async function giveCompanyStorage(companyId: string, product: string, quantity: number) {
  const key = { ownerType: "COMPANY" as const, ownerId: companyId, product: product as never, quality: 0 };
  const existing = await prisma.storage.findUnique({ where: { ownerType_ownerId_product_quality: key } });
  if (existing) {
    await prisma.storage.update({ where: { id: existing.id }, data: { quantity: BigInt(quantity) } });
  } else {
    await prisma.storage.create({ data: { ...key, quantity: BigInt(quantity) } });
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

export async function countryByCode(code: string) {
  return prisma.country.findUnique({ where: { code } });
}

export async function usCapital() {
  const us = await countryByCode("US");
  return prisma.region.findFirst({ where: { countryId: us!.id, isCapital: true } });
}

/** Teleport a citizen (used to undo the travel spec's move to Greece). */
export async function setLocation(citizenId: string, regionId: string) {
  await prisma.citizen.update({ where: { id: citizenId }, data: { locationRegionId: regionId } });
}

/** Create a weapon attachment directly in a citizen's inventory. */
export async function grantWa(ownerId: string, slot: string, quality: number, name: string) {
  return prisma.equipmentItem.create({
    data: {
      ownerType: "CITIZEN",
      ownerId,
      slot: slot as never,
      quality,
      name,
      params: [{ type: "MAX_DAMAGE", value: 1.5 * quality }] as never,
      description: "E2E fixture attachment",
    },
  });
}

/** Fund a company's fiat wallet so it can pay salaries. */
export async function fundCompanyFiat(companyId: string, minorUnits: number) {
  await prisma.company.update({ where: { id: companyId }, data: { fiatWallet: BigInt(minorUnits) } });
}

/** Give a citizen local currency (wallet rows are created lazily by the game). */
export async function fundWallet(citizenId: string, countryId: string, minorUnits: number) {
  await prisma.citizenWallet.upsert({
    where: { citizenId_countryId: { citizenId, countryId } },
    create: { citizenId, countryId, amount: BigInt(minorUnits) },
    update: { amount: { increment: BigInt(minorUnits) } },
  });
}

/** Set a country's treasury gold (cents) — PRINT_MONEY-style laws burn it. */
export async function fundTreasury(countryId: string, goldCents: number) {
  await prisma.country.update({ where: { id: countryId }, data: { treasuryGold: BigInt(goldCents) } });
}
