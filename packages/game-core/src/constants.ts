/**
 * eGeopolis — official spec constants (v2 ruleset).
 *
 * Raws: GRAIN, SUGAR, GUNPOWDER, STONE, WOOD, PETROL
 * Manufactured: AMMO, FOOD, ENERGY_DRINK, PANTRY, FRIDGE, HOSPITAL,
 *               FORTIFICATION, MILITARY_AIR_BASE, MILITARY_NAVY_BASE, TICKET
 * Money: minor units — 1 Gold = 100, 1 CC = 100. Market/FX supports 4 dp (0.0001).
 */

// ---------------------------------------------------------------------------
// Products & raw chain
// ---------------------------------------------------------------------------

export const RESOURCES = ["GRAIN", "SUGAR", "GUNPOWDER", "STONE", "WOOD", "PETROL"] as const;
export type Resource = (typeof RESOURCES)[number];

export const DENSITIES = ["NONE", "LOW", "MEDIUM", "HIGH"] as const;
export type Density = (typeof DENSITIES)[number];

export const DENSITY_RAW_FACTOR: Record<Density, number> = { NONE: 0, LOW: 2, MEDIUM: 3, HIGH: 4 };

export type Product =
  | Resource
  | "AMMO"
  | "FOOD"
  | "ENERGY_DRINK"
  | "PANTRY"
  | "FRIDGE"
  | "HOSPITAL"
  | "FORTIFICATION"
  | "MILITARY_AIR_BASE"
  | "MILITARY_NAVY_BASE"
  | "TICKET"
  | "FIRST_AID_KIT"
  | "SPECIAL_ITEM";

export const RAW_PRODUCTS: Resource[] = [...RESOURCES];

export const PRODUCT_RAW: Record<Exclude<Product, Resource>, Resource | null> = {
  AMMO: "GUNPOWDER",
  FOOD: "GRAIN",
  ENERGY_DRINK: "SUGAR",
  PANTRY: "WOOD",
  FRIDGE: "STONE",
  HOSPITAL: "STONE",
  FORTIFICATION: "STONE",
  MILITARY_AIR_BASE: "WOOD",
  MILITARY_NAVY_BASE: "STONE",
  TICKET: "PETROL",
  FIRST_AID_KIT: null,
  SPECIAL_ITEM: null,
};

/** Base raw need per unit at Q1; Qx multiplies by x (flat needs excepted). */
export const RAW_NEED_BASE: Record<Exclude<Product, Resource>, number> = {
  AMMO: 2,
  FOOD: 1,
  ENERGY_DRINK: 2,
  PANTRY: 1000, // flat (not per Q)
  FRIDGE: 2000, // flat
  HOSPITAL: 300,
  FORTIFICATION: 300,
  MILITARY_AIR_BASE: 1500,
  MILITARY_NAVY_BASE: 1500,
  TICKET: 4,
  FIRST_AID_KIT: 0,
  SPECIAL_ITEM: 0,
};

export function rawNeedPerUnit(product: Exclude<Product, Resource>, q: number): number {
  const base = RAW_NEED_BASE[product];
  return product === "PANTRY" || product === "FRIDGE" ? base : base * q;
}
export function productivityPerUnit(product: Exclude<Product, Resource>, q: number): number {
  return rawNeedPerUnit(product, q);
}

export const MAX_PRODUCT_QUALITY = 5;

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------

export const COMPANY_TOTAL_COST = [0, 20, 50, 100, 200, 400];
export const COMPANY_UPGRADE_COST = [0, 30, 50, 100, 200];
/** Sale price band: 70%–100% of the game-determined value (creation + upgrades), wiki: Companies for sale. */
export const COMPANY_SALE_MIN_PCT = 0.7;
export const COMPANY_RELOCATE_COST = [0, 2, 5, 10, 20, 40];
export const COMPANY_INDUSTRY_CHANGE_COST = [0, 4, 10, 20, 40, 80];
export const COMPANY_RELOCATE_INDUSTRY_COST = [0, 5, 12.5, 25, 50, 100];
export const COMPANY_WORKER_CAP = 20;
/** Production penalty after every work, reset at day change (wiki: Companies). */
export const WORK_PENALTY_PER_WORK = 0.0333;
export const COMPANY_DOWNGRADE_REFUND = 0.75;

export function employeeMultiplier(worked: number): number {
  if (worked <= 10) return 15 - (worked - 1) / 2;
  if (worked <= 20) return 13 - (3 * worked) / 10;
  if (worked < 30) return 11 - worked / 5;
  return 5;
}
export const RAW_QUALITY_MULT = [0, 1, 1.2, 1.4, 1.6, 1.8];
export const CAPITAL_MALUS = 0.75;
export const MANUFACTURED_HIGH_RAW_BONUS = 1.25;

// ---------------------------------------------------------------------------
// Health, limits & regen (v2 economy)
// ---------------------------------------------------------------------------

export const HP_MAX = 500; // hourly cron restores +100 HP → 500 cap
export const HP_HIT_COST = 10;
export const HP_BERSERK_COST = 50;
export const HP_REGEN_PER_HOUR = 100; // hourly cron
export const HP_DAY_CHANGE_BONUS = 100;

export const FOOD_HP_PER_QUALITY = 10; // +10 HP per Q
export const ENERGY_HP_PER_QUALITY = 10;
export const FOOD_LIMIT_BASE = 20; // daily
export const ENERGY_LIMIT_BASE = 20; // daily
export const PANTRY_FOOD_BONUS = 10; // non-stackable, 60-day lifespan, wood-repairable
export const FRIDGE_ENERGY_BONUS = 10;
export const HOSPITAL_LIMIT_BONUS = 1; // +1 food & +1 energy limit per Q (deployed in region)
export const PANTRY_FRIDGE_LIFESPAN_DAYS = 60;

export const TICKET_TRAVEL_HP = [0, 50, 40, 30, 15, 0]; // Q1 Economy −50 … Q5 First Class 0

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

export const MISS_CHANCE_BASE = 12.5;
export const CRIT_CHANCE_BASE = 12.5;
export const AVOID_CHANCE_BASE = 5;
export const CRIT_CHANCE_CAP = 40;
export const AVOID_CHANCE_CAP = 40;
export const WEAPON_REFUND_CAP = 40;
export const BERSERK_DISCOUNT_CAP = 40;
export const CRIT_MULTIPLIER = 2;
export const LOCATION_BONUS = 0.2;
export const CUT_OFF_DEBUFF = 0.2;

export const ROUND_DURATION_SECONDS = 3600; // regular rounds: 1 hour
export const CIVIL_ROUND_DURATION_SECONDS = 7200; // civil war rounds: 2 hours
export const ROUNDS_TO_WIN = 8;
export const MAX_ROUNDS = 15;
export const WALL_START = 50;
export const WALL_DS_PENALTY_PER_Q = 2.5;

export const AMMO_DAMAGE_BONUS_PCT = [0, 10, 27.5, 45, 62.5, 80]; // Q1 +10% … Q5 +80%

export function fortificationBonusPct(q: number): number {
  return 3 * q; // +3% damage per Q in battle rounds
}
export function hospitalRegenChance(_q: number): number {
  return 0.05; // v2: deployed hospital grants limits instead; kept for battle regen
}

/** 40 damage ranks — [threshold damage, name] with +1%/rank. */
export const MILITARY_RANKS: Array<[number, string]> = [
  [0, "Civil"],
  [100, "Reserves"],
  [250, "Cadet"],
  [500, "Private"],
  [1_000, "Private First Class"],
  [2_500, "Specialist"],
  [5_000, "Lance Corporal"],
  [10_000, "Corporal"],
  [17_500, "Sergeant"],
  [25_000, "Staff Sergeant"],
  [35_000, "Sergeant First Class"],
  [50_000, "Gunnery Sergeant"],
  [70_000, "Master Sergeant"],
  [100_000, "First Sergeant"],
  [150_000, "Master Gunnery Sergeant"],
  [250_000, "Sergeant Major"],
  [375_000, "Command Sergeant Major"],
  [500_000, "Sergeant Major of the Army"],
  [650_000, "Petty Officer E4"],
  [1_000_000, "Petty Officer E5"],
  [1_200_000, "Petty Officer E6"],
  [1_500_000, "Warrant Officer 1"],
  [2_000_000, "Chief Warrant Officer 2"],
  [2_500_000, "Chief Warrant Officer 3"],
  [3_000_000, "Chief Warrant Officer 4"],
  [4_000_000, "Chief Warrant Officer 5"],
  [5_000_000, "Second Lieutenant"],
  [6_500_000, "First Lieutenant"],
  [8_000_000, "Captain"],
  [10_000_000, "Major"],
  [12_500_000, "Lieutenant Colonel"],
  [15_000_000, "Colonel"],
  [17_500_000, "Brigadier General"],
  [20_000_000, "Major General"],
  [25_000_000, "Lieutenant General"],
  [30_000_000, "General"],
  [40_000_000, "General of the Army"],
  [50_000_000, "General of the Armies"],
  [75_000_000, "Grand Marshal"],
  [100_000_000, "Generalissimus"],
];

// ---------------------------------------------------------------------------
// Levels (51) — XP ranges; 5g reward per level-up from L9
// ---------------------------------------------------------------------------

/** Cumulative XP thresholds: L2=10 … L50=1,040,000, L51=1,160,000. */
export const LEVEL_XP: number[] = [
  0, 10, 20, 40, 60, 90, 130, 180, 240, 320, 430, 570, 750, 1000, 1300, 1700, 2200, 2800, 3600,
  4600, 5800, 7300, 9100, 11300, 14000, 17300, 21300, 26200, 32200, 39600, 48800, 60400, 74800,
  92800, 115200, 143000, 177600, 220800, 274400, 341600, 425600, 530400, 662400, 828000, 1036800,
  1298400, 1626400, 2036000, 2548000, 3188000, 3988000,
];
// Spec anchors: L50 = 1,040,000 cumulative, L51 = 1,160,000 — override the tail:
LEVEL_XP[49] = 1_040_000;
LEVEL_XP[50] = 1_160_000;

export const LEVEL_GOLD_FROM = 9;
export const LEVEL_GOLD = 5;

export const XP_PER_HIT = 1;
export const XP_PER_BERSERK = 5;
export const XP_PER_TRAIN = 4;
export const XP_PER_WORK = 5;
export const XP_PER_LAW_VOTE = 1;
export const XP_WIN_PARTY_LEADER = 50;
export const XP_WIN_CONGRESS = 50;
export const XP_WIN_PRESIDENT = 500;

export const FEATURE_LEVELS = {
  FIGHT: 2,
  WRITE_COMMENT: 1,
  CREATE_PARTY: 13,
  JOIN_MU: 13,
  VOTE: 13,
  CANDIDATE_PRESIDENT: 13,
  JOIN_PARTY: 13,
  CREATE_MU: 13,
  CREATE_STOCK_COMPANY: 13,
  CREATE_NEWS_PORTAL: 13,
  START_RESISTANCE_WAR: 13,
} as const;

// ---------------------------------------------------------------------------
// Eco & training
// ---------------------------------------------------------------------------

export const ECO_DAYS_PER_LEVEL = [0, 1, 2, 4, 8, 16, 32, 64, 64, 64, 64, 64, 64, 64, 64];
export const ECO_PRODUCTIVITY_STEP = 0.2;
export const ECO_SKILL_EQUIP_CAP = 10;

export const TRAIN_BASE_GAIN = 5.0;
export const TRAIN_LEVEL_COEFF = 0.1;
export const TRAINING_CENTER_BONUS = 0;
export const TRAIN_STREAK_BONUS_CHANCE = 0.25;
export const TRAIN_STREAK_BONUS_MULT = 0.5;
export const SUPER_SOLDIER_SESSIONS = 30;
export const HARD_WORKER_DAYS = 30;

// ---------------------------------------------------------------------------
// Armies (military units) — v2
// ---------------------------------------------------------------------------

export const ARMY_CREATE_COST = 5; // gold
export const ARMY_MAX_MEMBERS = 100;
export const ARMY_INITIAL_SLOTS = 1;
export const ARMY_RANKS = [
  { name: "Rookie", damageBonus: 0.05, slotCost: 5, upgradeCostPerSlot: 5 },
  { name: "Amateur", damageBonus: 0.1, slotCost: 10, upgradeCostPerSlot: 15 },
  { name: "Experienced", damageBonus: 0.15, slotCost: 25, upgradeCostPerSlot: 25 },
  { name: "Elite", damageBonus: 0.2, slotCost: 50, upgradeCostPerSlot: 50 },
];
export const ARMY_JOIN_COOLDOWN_DAYS = 3;
export const ARMY_ATTACHMENT_LOCK_DAYS = 3;

// ---------------------------------------------------------------------------
// Wars v2
// ---------------------------------------------------------------------------

export const WAR_DECLARE_COST_PLAYABLE = 30;
export const WAR_DECLARE_COST_NEUTRAL = 50;
export const ATTACK_REGION_COST_PLAYABLE = 10;
export const ATTACK_REGION_COST_NEUTRAL = 20;
export const DOW_ATTACK_WINDOW_HOURS = 24;
export const WAR_INITIATIVE_HOURS = 24;
export const RW_COST = 20;
export const RW_MIN_LEVEL = 13;
export const RW_COOLDOWN_MINUTES = 10;
export const CIVIL_BASE_COST = 100;
export const CIVIL_MIN_LEVEL = 13;
export const CIVIL_SUPPORT_RATIO = 0.3333;
export const CIVIL_POLL_HOURS = 24;
export const CIVIL_COOLDOWN_DAYS = 7;
export const BATTLE_HERO_GOLD = 5;
export const CAMPAIGN_HERO_GOLD = 30;
export const RESISTANCE_HERO_GOLD = 5;

// Regional conquest bonuses
export const CONQUEST_RAW_BONUS = 0.1;
export const CONQUEST_CAPITAL_BONUS = 0.1;
export const CONQUEST_NEUTRAL_FULL_BONUS = 0.1;
export const CONQUEST_NON_RAW_BONUS = 0.02;
export const CAPITAL_LOSS_PENALTY = 0.1;
export const BASE_BUILD_COOLDOWN_HOURS = 1; // air/navy base attack cooldown

// Battle drops (hits thresholds)
export function battleDropCounts(hits: number): Record<number, number> {
  return {
    4: Math.floor(hits / 37_500), // Q4 WA + Upgrade item → round heroes
    3: Math.floor(hits / 7_500), // top 3
    2: Math.floor(hits / 1_500), // top 10
    1: Math.floor(hits / 300), // everyone
  };
}
export const UPGRADE_ITEM_DROP_HITS = 2_500;

// ---------------------------------------------------------------------------
// Weapon Attachments (WA) — 8 slots, 9 parameters
// ---------------------------------------------------------------------------

export const WA_SLOTS = [
  "MUZZLE", "LASER", "OPTIC", "STOCK", "REAR_GRIP", "MAGAZINE", "BARREL", "UNDERBARREL",
] as const;
export type WaSlot = (typeof WA_SLOTS)[number];
export const MAX_WA_QUALITY = 5;
/** Battle drops only yield these slots (wiki: ways to obtain WAs). */
export const WA_DROP_SLOTS = ["REAR_GRIP", "MAGAZINE", "MUZZLE", "STOCK"] as const;
/** Generated auctions only yield these slots (wiki: ways to obtain WAs). */
export const WA_AUCTION_SLOTS = ["BARREL", "UNDERBARREL"] as const;
/** Event rewards only yield this slot (wiki: ways to obtain WAs). */
export const WA_EVENT_SLOTS = ["LASER"] as const;

export type WaParamType =
  | "HEADSHOT" | "RECOIL" | "MAX_DAMAGE" | "MIN_DAMAGE" | "STRENGTH" | "PUNCH" | "LUCK" | "RESUPPLY" | "GOOD_LOOKING";

export const WA_PARAM_PER_Q: Record<WaParamType, number> = {
  HEADSHOT: 1, // +1%/Q
  RECOIL: -1, // −1%/Q
  MAX_DAMAGE: 1.5, // +1.5%/Q
  MIN_DAMAGE: 0.9, // +0.9%/Q
  STRENGTH: 3, // +3/Q
  PUNCH: 3, // +3/Q
  LUCK: 1, // +1%/Q
  RESUPPLY: 1, // +1%/Q
  GOOD_LOOKING: 1, // +1/Q
};

export const WA_BASE = { strength: 100, headshot: 5, recoil: 9.5, luck: 5 };
export const WA_CAPS = { headshot: 40, recoilFloor: 0, luck: 40, strength: Infinity };

export const WA_MERGE_FEE = [0, 0.67, 2, 6, 18]; // 3×Qx → Qx+1 (index = ingredient quality)
export const WA_MERGE_INGREDIENTS = 3;
export const WA_DECAY_ANNUAL = true;

// ---------------------------------------------------------------------------
// Special items & buffs (1g each)
// ---------------------------------------------------------------------------

export const SPECIAL_ITEMS = ["ADRENALIN_RUSH", "MATRIX", "UPGRADE"] as const;
export const BUFFS = ["STEROID", "RAMBO", "PATRIOT", "REBEL"] as const;
export type BuffType = (typeof BUFFS)[number];
export const BUFF_COST_GOLD = 1;
export const BUFF_DURATION_HOURS = 24;
export const DEBUFF_DURATION_HOURS_PREMIUM = 24;
export const DEBUFF_DURATION_HOURS = 48;
export const BUFF_DAMAGE_BONUS = 0.1;

// ---------------------------------------------------------------------------
// Politics v2 — calendar (day-of-month within 30-day cycle)
// ---------------------------------------------------------------------------

export const ELECTION_CYCLE_DAYS = 30;
export const PRESIDENT_DAY = 1;
export const PRESIDENT_CANDIDATURE_DAYS = [28, 29, 30]; // last 3 days of preceding cycle
export const PARTY_DAY = 11;
export const PARTY_CANDIDATURE_DAYS = [8, 9, 10];
export const CONGRESS_DAY = 21;
export const CONGRESS_LIST_DAYS = [18, 19, 20];
export const CONGRESS_SEATS = 20;
export const FIXED_PARTIES = ["Far-Left", "Left", "Center", "Right", "Far-Right"] as const;
export const PRESIDENT_FEE = 10;
export const PARTY_LEADER_FEE = 2;
export const PRESIDENT_LAWS_PER_DAY = 5;
export const LAW_VOTE_WINDOW_HOURS = 48;
export const IMPEACH_THRESHOLD = 0.7;

// Embargos
export const EMBARGO_TYPES = ["MARKETPLACE", "JOB", "MONETARY"] as const;
export const EMBARGO_COST = 10;
export const EMBARGO_DAYS = 30;

// Alliances
export const ALLIANCE_MAX_MEMBERS = 5;
export const ALLIANCE_CREATE_COST = 50;
export const ALLIANCE_ORDER_BONUS_PER_MEMBER = 0.02;
export const ALLIANCE_ORDER_BONUS_CAP = 0.1;

// Laws
export const PRINT_MONEY_GOLD_PER_CC = 0.005;
export const PRINT_MONEY_MIN_GOLD = 1;
export const PRINT_MONEY_MAX_GOLD = 1000;
export const CITIZENSHIP_FEE = 30;
export const CITIZENSHIP_MONTHLY_CAP = 10;

// ---------------------------------------------------------------------------
// Contracts & loans
// ---------------------------------------------------------------------------

export const CONTRACT_TYPES = ["LOAN", "PACK_SALE"] as const;
export const CONTRACT_MIN_DURATION_DAYS = 1;
export const CONTRACT_MAX_DURATION_DAYS = 365;
export const CONTRACT_MAX_INTEREST_PCT = 100;

// ---------------------------------------------------------------------------
// JSC v2
// ---------------------------------------------------------------------------

export const JSC_CREATE_COST = 100;
export const JSC_FEE_SHARE = 0.5;
export const JSC_MAX_SHARES = 1_000_000;
export const STOCK_TRADE_FEE = 0.01; // 1% on share buys
export const JSC_INACTIVE_LIQUIDATION_DAYS = 30;

// ---------------------------------------------------------------------------
// Cabinet (vCP = vice country president) & treaties
// ---------------------------------------------------------------------------

/** Fixed cabinet roles; ministers are chosen from active congress members (wiki). */
export const CABINET_ROLES = ["VICE_PRESIDENT", "DEFENSE", "FINANCE", "FOREIGN_AFFAIRS"] as const;
export type CabinetRole = (typeof CABINET_ROLES)[number];
/** Laws the vCP may propose while the president cannot (wiki: vCP proposes war laws). */
export const VCP_WAR_LAWS = ["DECLARE_WAR", "ATTACK_REGION"] as const;
/** PROPOSE_MDMA / CANCEL_MDMA fee, charged from the proposing country treasury (wiki). */
export const TREATY_FEE_GOLD = 10;

// ---------------------------------------------------------------------------
// News portals, referrals, achievements, tournaments
// ---------------------------------------------------------------------------

export const NEWS_PORTAL_CREATE_COST = 50; // gold
export const NEWS_PORTAL_VIEWS_PER_GOLD = 100;
export const NEWS_PORTAL_ARTICLES_PER_DAY = 5;
export const NEWS_CATEGORIES = ["POLITICS", "WAR", "ECONOMY", "FUN_OTHER"] as const;

export const REFERRAL_GOLD_AT_LEVEL = { EARLY: 9, LATE: 13 }; // 5g at L9 or L13
export const REFERRAL_GOLD = 5;
export const REFERRAL_PER_LEVELUP = 0.5;
export const REFERRAL_PER_MEDAL = 0.5;

export const ACHIEVEMENT_SUBCATEGORIES = [
  "MILITARY", "ECONOMY", "MEDALS", "INVITER", "COMMUNITY",
  "POLITICS", "GAME_SUPPORT", "EVENTS", "GENERAL", "WEAPON_ATTACHMENTS",
] as const;
export const ACHIEVEMENT_COMPLETION_REWARD = 2; // gold per 100% subcategory

export const TOURNAMENTS = [
  { id: "GUNPOWDER_CUP", teams: 8, groupSize: 4, roundMinutes: 60 },
  { id: "GLOBAL_WAR", roundMinutes: 10, roundsToWin: 8 },
  { id: "ARMY_CUP", fee: 125, minMembers: 5, roundMinutes: 4 },
  { id: "COUNTRY_CUP", roundMinutes: 4, singleElimination: true },
  { id: "QUICKDROP_CUP", dynamic: true },
  { id: "ONE_VS_ONE", entryFee: 50, firstPrize: 1000 },
  { id: "FIRST_AID", rounds: 5, roundMinutes: 60 },
] as const;

/**
 * Per-type engine config (wiki §tournaments).
 * kind: BRACKET = single elimination (byes auto-advance) · GROUPS = 2 groups
 * round-robin → semis → final · BATTLE = one two-sided match · MELEE = free-for-all
 * ranked by hits (live damage counter).
 */
export const TOURNAMENT_CFG: Record<string, {
  kind: "BRACKET" | "GROUPS" | "BATTLE" | "MELEE";
  rounds: number; // max rounds per match (MELEE: rounds × roundMinutes window)
  wins: number; // round wins needed to win a match
  roundMinutes: number;
  firstRoundMinutes?: number; // e.g. 1v1: round 1 is 5 min, the rest 2 min
  fee?: number; // entry fee, gold, charged at registration
  minMembers?: number; // ARMY_CUP: minimum army members to field a team
}> = {
  GUNPOWDER_CUP: { kind: "GROUPS", rounds: 3, wins: 2, roundMinutes: 60 },
  GLOBAL_WAR: { kind: "BATTLE", rounds: 15, wins: 8, roundMinutes: 10 },
  ARMY_CUP: { kind: "BRACKET", rounds: 9, wins: 5, roundMinutes: 4, fee: 125, minMembers: 5 },
  COUNTRY_CUP: { kind: "BRACKET", rounds: 9, wins: 5, roundMinutes: 4 },
  QUICKDROP_CUP: { kind: "MELEE", rounds: 1, wins: 1, roundMinutes: 5 },
  ONE_VS_ONE: { kind: "BRACKET", rounds: 5, wins: 3, roundMinutes: 2, firstRoundMinutes: 5, fee: 50 },
  FIRST_AID: { kind: "MELEE", rounds: 5, wins: 1, roundMinutes: 60 },
};

// ---------------------------------------------------------------------------
// Special events (wiki Category 7): Halloween, King of the Hill, Patriot Week
// ---------------------------------------------------------------------------

/** Halloween invasion: 2-hour rounds, walls fortify +1 quality per round (dynamic walls). */
export const HALLOWEEN_ROUND_SECONDS = 7200;
export const KOTH_REWARD_GOLD = 100; // paid to the capturing country's treasury
/** Training Yard (wiki): 1-hour practice rounds, first to 8 wins. */
export const TRAINING_ROUND_SECONDS = 3600;

/** Monthly rewards (wiki): top-5 damage countries & armies per 30-day period. */
export const MONTH_DAYS = 30;
export const MONTHLY_COUNTRY_GOLD = [500, 250, 150, 100, 50];
export const MONTHLY_ARMY_GOLD = [500, 250, 150, 100, 50];

/** Yearly rewards (wiki): top players/armies/countries/region counts at the annual FAK reset. */
export const YEAR_DAYS = 365;
export const YEARLY_CITIZEN_GOLD = [1000, 500, 250];
export const YEARLY_ARMY_GOLD = [500, 250, 100];
export const YEARLY_COUNTRY_GOLD = [500, 250, 100];
export const YEARLY_REGION_GOLD = [300, 200, 100];

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export const STARTER_GOLD = 50;
/** Premium packs (wiki): simulated payment gateway — FAKs, gold & premium days. */
export const PREMIUM_PACKS = {
  BRONZE: { gold: 10, firstAidKits: 5, premiumDays: 7 },
  SILVER: { gold: 25, firstAidKits: 15, premiumDays: 30 },
  GOLD: { gold: 50, firstAidKits: 40, premiumDays: 90 },
} as const;
export type PremiumPackKey = keyof typeof PREMIUM_PACKS;
export const STARTER_ITEMS = [
  { product: "FOOD" as const, quality: 1, qty: 10 },
  { product: "AMMO" as const, quality: 1, qty: 5 },
];
export const DAY_MS = 86_400_000;
