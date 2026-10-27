/**
 * eGeopolis — pure game formulas (v2 ruleset). Deterministic given injected RNG.
 */
import {
  AVOID_CHANCE_BASE,
  AVOID_CHANCE_CAP,
  BERSERK_DISCOUNT_CAP,
  CAPITAL_MALUS,
  CRIT_CHANCE_BASE,
  CRIT_CHANCE_CAP,
  CRIT_MULTIPLIER,
  DENSITY_RAW_FACTOR,
  ECO_DAYS_PER_LEVEL,
  HP_MAX,
  LEVEL_GOLD,
  LEVEL_GOLD_FROM,
  LEVEL_XP,
  MANUFACTURED_HIGH_RAW_BONUS,
  AMMO_DAMAGE_BONUS_PCT,
  MILITARY_RANKS,
  MISS_CHANCE_BASE,
  RAW_QUALITY_MULT,
  WALL_DS_PENALTY_PER_Q,
  WALL_START,
  WA_BASE,
  WA_CAPS,
  WA_PARAM_PER_Q,
  MAX_WA_QUALITY,
  employeeMultiplier,
  type Density,
  type WaParamType,
} from "./constants";
import type { WaParam } from "./types";

export interface EquipmentAggregate {
  // WA aggregate (8 slots)
  headshotPct: number;
  recoilReduction: number; // pct added to base 9.5
  maxDamagePct: number;
  minDamagePct: number;
  strengthBonus: number;
  punch: number;
  luckPct: number;
  resupplyPct: number;
  goodLooking: number;
}

export const EMPTY_EQUIPMENT: EquipmentAggregate = {
  headshotPct: 0,
  recoilReduction: 0,
  maxDamagePct: 0,
  minDamagePct: 0,
  strengthBonus: 0,
  punch: 0,
  luckPct: 0,
  resupplyPct: 0,
  goodLooking: 0,
};

export interface DamageContext {
  strength: number; // base (WA STRENGTH param adds in service)
  level: number;
  rankBonusPct: number; // (rank-1)%
  ammoMultiplier: number; // 1 … 1.8 (Q5 ammo)
  equip: EquipmentAggregate;
  bonusDamagePct?: number; // location ±20%, fortification, army order, buffs, conquest
}

/** HitDamage = ((Strength·10) + (Level·5) + RankBonus) · AmmoMult · (1 + equip% + bonus%) + Punch */
export function baseDamage(ctx: DamageContext): number {
  const str = ctx.strength + ctx.equip.strengthBonus;
  const rankBonus = str * 10 * ctx.rankBonusPct;
  const inside = str * 10 + ctx.level * 5 + rankBonus;
  const scaled = inside * ctx.ammoMultiplier * (1 + (ctx.equip.minDamagePct + ctx.equip.maxDamagePct) / 200 + (ctx.bonusDamagePct ?? 0));
  return scaled + ctx.equip.punch;
}

export function damageBand(ctx: DamageContext): { min: number; max: number } {
  const min = baseDamage({ ...ctx, equip: { ...ctx.equip, maxDamagePct: 0 } });
  const max = baseDamage(ctx);
  return { min: Math.floor(min), max: Math.floor(Math.max(min, max)) };
}

export function rollDamage(band: { min: number; max: number }, rng: () => number): number {
  const v = band.min + (band.max - band.min) * rng();
  return Math.max(1, Math.floor(v));
}

export function effectiveHeadshot(equip: EquipmentAggregate): number {
  return Math.min(WA_CAPS.headshot, WA_BASE.headshot + equip.headshotPct);
}
export function effectiveRecoil(equip: EquipmentAggregate): number {
  return Math.max(WA_CAPS.recoilFloor, WA_BASE.recoil - equip.recoilReduction);
}
export function effectiveLuck(equip: EquipmentAggregate): number {
  return Math.min(WA_CAPS.luck, WA_BASE.luck + equip.luckPct);
}
export function effectiveCritChance(equip: EquipmentAggregate): number {
  return Math.min(CRIT_CHANCE_CAP, CRIT_CHANCE_BASE + equip.luckPct / 2);
}
export function effectiveMissChance(equip: EquipmentAggregate): number {
  return Math.max(0, MISS_CHANCE_BASE - equip.resupplyPct / 2);
}
export function effectiveAvoidChance(equip: EquipmentAggregate): number {
  return Math.min(AVOID_CHANCE_CAP, AVOID_CHANCE_BASE + equip.goodLooking);
}

export function rollCrit(critChance: number, rng: () => number): boolean {
  return rng() * 100 < critChance;
}
export function rollMiss(missChance: number, rng: () => number): boolean {
  return rng() * 100 < missChance;
}
export function rollAvoid(avoidChance: number, rng: () => number): boolean {
  return rng() * 100 < avoidChance;
}
export function rollHeadshot(headshotPct: number, rng: () => number): boolean {
  return rng() * 100 < Math.min(40, headshotPct);
}
export function rollResupply(resupplyPct: number, rng: () => number): boolean {
  return rng() * 100 < Math.min(40, resupplyPct);
}
export function berserkAmmoCount(rng: () => number): number {
  return 5; // v2: no discount param; resupply can refund mid-burst
}

export function wallPercent(attackerDamage: number, defenderDamage: number, fortificationQ: number): number {
  if (attackerDamage + defenderDamage <= 0) return WALL_START - WALL_DS_PENALTY_PER_Q * fortificationQ;
  const share = (attackerDamage / (attackerDamage + defenderDamage)) * 50;
  return Math.min(100, Math.max(0, WALL_START - WALL_DS_PENALTY_PER_Q * fortificationQ + share));
}

/** Military rank: index in the 40-rank table; bonus = (rank-1)×1%. */
export function militaryRank(totalDamage: number): { name: string; bonusPct: number; index: number } {
  let idx = 0;
  for (let i = 0; i < MILITARY_RANKS.length; i++) {
    if (totalDamage >= MILITARY_RANKS[i][0]) idx = i;
  }
  return { name: MILITARY_RANKS[idx][1], bonusPct: idx * 0.01, index: idx + 1 };
}

/**
 * Training Yard (wiki): practice hits are capped by the fighter's damage rank —
 * the ceiling is the next rank's damage threshold (top rank gets +50% of its own).
 * Keeps practice battles meaningful for new players: legends cannot one-shot the yard.
 */
export function rankDamageCap(totalDamage: number): number {
  const { index } = militaryRank(Math.max(0, totalDamage)); // 1-based
  const next = MILITARY_RANKS[index]; // MILITARY_RANKS[index] is the NEXT tier for a 1-based index
  if (next) return next[0];
  return Math.floor(MILITARY_RANKS[MILITARY_RANKS.length - 1][0] * 1.5);
}

export function ammoMultiplier(q: number): number {
  return 1 + (AMMO_DAMAGE_BONUS_PCT[Math.min(5, Math.max(0, q))] ?? 0) / 100;
}

export function xpToReach(level: number): number {
  if (level <= 1) return 0;
  return LEVEL_XP[Math.min(level - 1, LEVEL_XP.length - 1)];
}

export function levelForXp(xp: number): number {
  let lvl = 1;
  while (lvl < 51 && xp >= xpToReach(lvl + 1)) lvl++;
  return lvl;
}

export function applyXp(currentXp: number, currentLevel: number, gained: number): {
  xp: number; level: number; levelsGained: number;
} {
  const xp = currentXp + gained;
  const level = levelForXp(xp);
  return { xp, level, levelsGained: Math.max(0, level - currentLevel) };
}

export function levelUpGold(newLevel: number): number {
  return newLevel >= LEVEL_GOLD_FROM ? LEVEL_GOLD : 0;
}

// Eco skill & productivity (wiki: P = (4+E)·N·C·R·M)
export function ecoLevelFor(ecoSkill: number): number {
  return Math.max(1, Math.floor(ecoSkill));
}
export function daysNeededForNextEcoLevel(ecoSkill: number): number {
  const lvl = ecoLevelFor(ecoSkill);
  return ECO_DAYS_PER_LEVEL[Math.min(lvl, ECO_DAYS_PER_LEVEL.length - 1)] || 64;
}
export function ecoGainPerWork(ecoSkill: number): number {
  const t = Math.min(1, Math.max(0, (ecoSkill - 1) / 14));
  return 0.05 - 0.03 * t;
}
export function ecoGainPerWorkWiki(ecoSkill: number): number {
  return 1 / daysNeededForNextEcoLevel(ecoSkill);
}

export interface ProductivityInput {
  ecoSkill: number;
  employeesWorkedToday: number;
  companyQuality: number;
  countryControlsCapital: boolean;
  rawDensity: Density;
  countryOwnsHighRaw: boolean;
  isRawCompany: boolean;
}

export function productivity(input: ProductivityInput): number {
  const E = ecoLevelFor(input.ecoSkill);
  const N = employeeMultiplier(Math.max(1, input.employeesWorkedToday));
  const C = input.countryControlsCapital ? 1 : CAPITAL_MALUS;
  const base = input.companyQuality / 20 + 1 / 5;
  let R: number;
  if (input.isRawCompany) {
    R = DENSITY_RAW_FACTOR[input.rawDensity] * base;
  } else {
    const k = DENSITY_RAW_FACTOR[input.rawDensity] || 1;
    R = k * base;
    if (input.countryOwnsHighRaw && input.rawDensity === "HIGH") R *= MANUFACTURED_HIGH_RAW_BONUS;
  }
  const qMult = input.isRawCompany ? RAW_QUALITY_MULT[input.companyQuality] ?? 1 : 1;
  return (4 + E) * N * C * R * qMult;
}

// Training (spec)
export function strengthGain(level: number, tcBonus = 0): number {
  return 5.0 + level * 0.1 + tcBonus;
}

// Armies (v2)
import { ARMY_RANKS } from "./constants";
export function armyDamageBonus(rankIdx: number): number {
  return ARMY_RANKS[Math.max(0, Math.min(rankIdx, ARMY_RANKS.length - 1))].damageBonus;
}
export function armySlotCost(rankIdx: number): number {
  return ARMY_RANKS[Math.max(0, Math.min(rankIdx, ARMY_RANKS.length - 1))].slotCost;
}
export function armyUpgradeCostPerSlot(rankIdx: number): number {
  return ARMY_RANKS[Math.max(0, Math.min(rankIdx, ARMY_RANKS.length - 1))].upgradeCostPerSlot;
}

// Time
export function serverDay(serverStartEpochMs: number, nowMs: number = Date.now()): number {
  return Math.floor((nowMs - serverStartEpochMs) / 86_400_000) + 1;
}
export function dayProgress(dayStartMs: number, nowMs: number): number {
  return Math.min(1, Math.max(0, (nowMs - dayStartMs) / 86_400_000));
}

export { HP_MAX, WA_BASE };

// ---------------------------------------------------------------------------
// Weapon-attachment param whitelist (defense-in-depth): the params column is
// plain JSON — sanitize every read so corrupted/poisoned rows can never reach
// combat math. Values are clamped to |per-Q| × quality × 1.25 (the generator's
// maximum jitter), RECOIL sign-corrected negative, unknown types dropped.
// ---------------------------------------------------------------------------
export const WA_MAX_PARAMS = 3;

export function sanitizeWaParams(raw: unknown, quality: number): WaParam[] {
  if (!Array.isArray(raw)) return [];
  const q = Math.max(1, Math.min(MAX_WA_QUALITY, Math.floor(quality) || 1));
  const out: WaParam[] = [];
  for (const entry of raw.slice(0, WA_MAX_PARAMS)) {
    if (!entry || typeof entry !== "object") continue;
    const { type, value } = entry as { type?: unknown; value?: unknown };
    if (typeof type !== "string" || !(type in WA_PARAM_PER_Q)) continue;
    const t = type as WaParamType;
    const bound = Math.abs(WA_PARAM_PER_Q[t]) * q * 1.25;
    let v = typeof value === "number" && Number.isFinite(value) ? value : bound;
    v = WA_PARAM_PER_Q[t] < 0 ? -Math.min(Math.abs(v), bound) : Math.min(Math.max(v, 0), bound);
    out.push({ type: t, value: Number(v.toFixed(2)) });
  }
  return out;
}
