import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import {
  CAPITAL_MALUS,
  DENSITY_RAW_FACTOR,
  employeeMultiplier,
  COMPANY_WORKER_CAP,
  WORK_PENALTY_PER_WORK,
  FOOD_HP_PER_QUALITY,
  FOOD_LIMIT_BASE,
  ENERGY_HP_PER_QUALITY,
  ENERGY_LIMIT_BASE,
  HARD_WORKER_DAYS,
  HP_HIT_COST,
  HP_MAX,
  MANUFACTURED_HIGH_RAW_BONUS,
  productivityPerUnit,
  RAW_NEED_BASE,
  RAW_QUALITY_MULT,
  SUPER_SOLDIER_SESSIONS,
  TRAIN_BASE_GAIN,
  TRAIN_LEVEL_COEFF,
  TRAIN_STREAK_BONUS_CHANCE,
  TRAIN_STREAK_BONUS_MULT,
  TRAINING_CENTER_BONUS,
  HOSPITAL_LIMIT_BONUS,
  type Density,
  type Product,
  type Resource,
} from "@egeopolis/game-core";
import { PrismaService, type Tx } from "../prisma/prisma.service";
import { GameService } from "../game/game.service";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class ActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService,
    private readonly redis: RedisService,
  ) {}

  async dailyTasks(citizenId: string) {
    const day = await this.game.currentDay();
    const serverStart = await this.game.serverStart();
    const dayStart = new Date(serverStart + (day - 1) * 86_400_000);

    const citizen = await this.prisma.citizen.findUniqueOrThrow({ where: { id: citizenId } });
    const pantry = citizen.pantryDaysLeft > 0 ? 10 : 0;
    const fridge = citizen.fridgeDaysLeft > 0 ? 10 : 0;
    const hospital = await this.locationHospitalBonus(citizenId);
    const adWatch = citizen.adWatchOnDay === day ? 5 : 0;

    const activeEmployment = await this.prisma.employment.findFirst({
      where: { citizenId, active: true },
      include: { company: { select: { id: true, name: true, product: true, quality: true } } },
    });
    const hiredTodayRow = await this.prisma.employment.findFirst({
      where: { citizenId, startedAt: { gte: dayStart } },
      select: { id: true },
    });
    const hiredToday = Boolean(hiredTodayRow);

    return {
      day,
      worked: citizen.workedOnDay === day,
      trained: citizen.trainedOnDay === day,
      foodUsed: citizen.foodUsed,
      foodLimit: FOOD_LIMIT_BASE + pantry + hospital + adWatch,
      energyUsed: citizen.giftUsed,
      energyLimit: ENERGY_LIMIT_BASE + fridge + hospital,
      pantryDaysLeft: citizen.pantryDaysLeft,
      fridgeDaysLeft: citizen.fridgeDaysLeft,
      adWatchUsed: citizen.adWatchOnDay === day,
      hasJob: Boolean(activeEmployment),
      job: activeEmployment
        ? {
            companyId: activeEmployment.companyId,
            companyName: activeEmployment.company.name,
            product: activeEmployment.company.product,
            quality: activeEmployment.company.quality,
            salary: Number(activeEmployment.salary) / 100,
            hiredToday,
          }
        : null,
      hiredToday,
      canQuitJob: Boolean(activeEmployment && !hiredToday),
    };
  }

  /** Deployed hospital in the citizen's region: +1 food & +1 energy limit per Q. */
  private async locationHospitalBonus(citizenId: string): Promise<number> {
    const citizen = await this.prisma.citizen.findUniqueOrThrow({
      where: { id: citizenId },
      select: { locationRegion: { select: { buildings: { where: { type: "HOSPITAL" } } } } },
    });
    return citizen.locationRegion.buildings.reduce((s, b) => s + b.quality * HOSPITAL_LIMIT_BONUS, 0);
  }

  private async bestAssetQuality(citizenId: string, product: Product): Promise<number> {
    const row = await this.prisma.storage.findFirst({
      where: { ownerType: "CITIZEN", ownerId: citizenId, product, quantity: { gt: 0 } },
      orderBy: { quality: "desc" },
    });
    return row?.quality ?? 0;
  }

  // ---------------------------------------------------------------------------
  // TRAIN — spec: BaseStrengthGain = 5.0 + (Level * 0.1) + TrainingCenterBonus
  // ---------------------------------------------------------------------------

  async train(citizenId: string) {
    const day = await this.game.currentDay();
    return this.redis.withLock(`train:${citizenId}:${day}`, 5000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const citizen = await tx.citizen.findUniqueOrThrow({ where: { id: citizenId } });
        if (citizen.trainedOnDay === day) throw new ConflictException("already trained today");

        let gain = TRAIN_BASE_GAIN + citizen.level * TRAIN_LEVEL_COEFF + TRAINING_CENTER_BONUS;
        if (citizen.trainStreak >= SUPER_SOLDIER_SESSIONS && Math.random() < TRAIN_STREAK_BONUS_CHANCE) {
          gain *= 1 + TRAIN_STREAK_BONUS_MULT;
        }

        const newStreak = citizen.lastTrainedDay === day - 1 ? citizen.trainStreak + 1 : 1;
        const sessions = citizen.trainTotalSessions + 1;
        await tx.citizen.update({
          where: { id: citizenId },
          data: {
            strength: { increment: gain },
            trainTotalSessions: sessions,
            trainStreak: newStreak,
            lastTrainedDay: day,
            trainedOnDay: day,
          },
        });
        await this.game.applyProgress(tx, citizenId, 4);
        if (sessions % SUPER_SOLDIER_SESSIONS === 0) {
          await this.game.awardMedal(tx, citizenId, "SUPER_SOLDIER", 5, { sessions });
        }
        return {
          strengthGained: Number(gain.toFixed(2)),
          strength: Number((Number(citizen.strength) + gain).toFixed(2)),
        };
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // WORK — wiki productivity P = (4+E)·N·C·R·M + conquest bonuses
  // ---------------------------------------------------------------------------

  async work(citizenId: string) {
    const day = await this.game.currentDay();
    return this.redis.withLock(`work:${citizenId}:${day}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const citizen = await tx.citizen.findUniqueOrThrow({ where: { id: citizenId } });
        if (citizen.workedOnDay === day) throw new ConflictException("already worked today");
        if (citizen.hp < HP_HIT_COST) throw new BadRequestException("not enough health");

        const employment = await tx.employment.findFirst({
          where: { citizenId, active: true },
          include: {
            company: { include: { region: true, workedToday: { where: { day } } } },
          },
        });
        if (!employment) throw new BadRequestException("no active job — apply on the job market");
        const company = employment.company;

        if (company.region.countryId !== citizen.citizenshipCountryId) {
          throw new BadRequestException("companies can only be worked in your home country");
        }

        const ecoSkill = citizen.ecoSkill;
        const ecoGain = Number((0.05 - 0.03 * Math.min(1, Math.max(0, (ecoSkill - 1) / 14))).toFixed(4));

        const worksToday = company.workedToday[0]?.count ?? 0;
        if (worksToday >= COMPANY_WORKER_CAP) throw new ConflictException(`company work limit is ${COMPANY_WORKER_CAP} per day`);

        const isRaw = isRawProduct(company.product);
        const rawName: Resource | null = isRaw ? (company.product as Resource) : productRaw(company.product as Exclude<Product, Resource>);
        const density: Density = rawName
          ? company.region.resource === rawName
            ? company.region.density
            : "NONE"
          : "NONE";

        const E = Math.floor(ecoSkill);
        const N = employeeMultiplier(worksToday + 1);
        const W = 1 - WORK_PENALTY_PER_WORK * worksToday; // 3.33% penalty per prior work, resets at day change (wiki)
        const C = company.region.isCapital ? 1 : CAPITAL_MALUS;
        const base = company.quality / 20 + 1 / 5;
        let P: number;
        if (isRaw) {
          P = (4 + E) * N * W * C * (DENSITY_RAW_FACTOR[density] * base) * (RAW_QUALITY_MULT[company.quality] ?? 1);
        } else {
          const ownsHigh = await this.countryOwnsHighRaw(company.region.countryId, rawName);
          const R = DENSITY_RAW_FACTOR[density] || 1;
          P = (4 + E) * N * W * C * (R * base) * (ownsHigh && density === "HIGH" ? MANUFACTURED_HIGH_RAW_BONUS : 1);
        }

        // Conquest bonuses (spec): raw +10% on own chain, capital +10%, non-raw +2%,
        // capital loss −10%.
        const conquest = await this.conquestBonus(company.region.countryId, company.product as Product, isRaw);

        let units = Math.floor(P * (1 + conquest));
        let rawUsed = 0;
        if (!isRaw) {
          const perUnit = productivityPerUnit(company.product as Exclude<Product, Resource>, company.quality);
          const avail = Number(await this.game.getStorageQuantity(tx, "COMPANY", company.id, rawName as Product, 0));
          units = Math.min(units, Math.floor(avail / perUnit));
          rawUsed = units * perUnit;
          if (units <= 0) throw new ConflictException("not enough raw materials in company storage");
        } else if (units <= 0) {
          throw new ConflictException("this region has no matching resource bonus");
        }

        const salary = employment.salary;
        const tax = (salary * BigInt(await this.incomeTax(company.region.countryId))) / BigInt(100);
        const net = salary - tax;
        try {
          await this.game.companyWalletMove(tx, company.id, -salary, "WAGE_PAYMENT", company.region.countryId);
        } catch {
          throw new ConflictException("company wallet cannot cover the salary");
        }
        if (tax > BigInt(0)) {
          await this.game.treasuryFiatCredit(tx, company.region.countryId, tax, "TAX");
        }
        await this.game.walletCredit(tx, citizenId, company.region.countryId, net, "SALARY");

        if (isRaw) {
          await this.game.addStorage(tx, "COMPANY", company.id, company.product, 0, units);
        } else {
          await this.game.subtractStorage(tx, "COMPANY", company.id, rawName as Product, 0, rawUsed);
          await this.game.addStorage(tx, "COMPANY", company.id, company.product, company.quality, units);
        }
        await tx.workedToday.upsert({
          where: { companyId_day: { companyId: company.id, day } },
          create: { companyId: company.id, day, count: 1 },
          update: { count: { increment: 1 } },
        });

        const newWorkStreak = citizen.lastWorkedDay === day - 1 ? citizen.workStreak + 1 : 1;
        await tx.citizen.update({
          where: { id: citizenId },
          data: {
            hp: { decrement: HP_HIT_COST },
            ecoSkill: { increment: ecoGain },
            workedOnDay: day,
            workTotalDays: { increment: 1 },
            workStreak: newWorkStreak,
            lastWorkedDay: day,
          },
        });
        await this.game.applyProgress(tx, citizenId, 5);
        if (newWorkStreak > 0 && newWorkStreak % HARD_WORKER_DAYS === 0) {
          await this.game.awardMedal(tx, citizenId, "HARD_WORKER", 5, { streak: newWorkStreak });
        }

        return {
          units,
          product: company.product,
          quality: company.quality,
          salary: Number(salary) / 100,
          netSalary: Number(net) / 100,
          taxPaid: Number(tax) / 100,
          ecoGained: ecoGain,
          hpLost: HP_HIT_COST,
          productivity: Number(P.toFixed(2)),
        };
      }),
    );
  }

  private async conquestBonus(countryId: string, product: Product, isRaw: boolean): Promise<number> {
    const country = await this.prisma.country.findUniqueOrThrow({
      where: { id: countryId },
      include: { regions: { where: { coreCountryId: { not: countryId } }, select: { kind: true, resource: true } } },
    });
    const ownsOwnCapital = await this.prisma.region.count({ where: { countryId, coreCountryId: countryId, kind: "CAPITAL" } }) > 0;
    let bonus = 0;
    if (isRaw) {
      bonus += country.regions.filter((r) => r.resource === product).length > 0 ? 0.1 : 0;
    }
    for (const r of country.regions) {
      if (r.kind === "CAPITAL") bonus += 0.1;
      else if (r.kind === "RAW") bonus += isRaw ? 0 : 0.1;
      else bonus += 0.02;
    }
    if (!ownsOwnCapital) bonus -= 0.1; // capital loss penalty
    return bonus;
  }

  private async incomeTax(countryId: string): Promise<number> {
    const tax = await this.prisma.countryTax.findFirst({ where: { countryId, product: "FOOD" } });
    return tax?.incomeTax ?? 25;
  }

  private async countryOwnsHighRaw(countryId: string, raw: Resource | null): Promise<boolean> {
    if (!raw) return false;
    return (await this.prisma.region.count({ where: { countryId, resource: raw, density: "HIGH" } })) > 0;
  }

  // ---------------------------------------------------------------------------
  // CONSUME — Food & Energy Drink each have their own daily cap; FAK is uncapped.
  // ---------------------------------------------------------------------------

  async consume(citizenId: string, kind: "FOOD" | "ENERGY_DRINK" | "FIRST_AID_KIT", quality: number, qty: number) {
    const n = Math.max(1, Math.min(100, Math.floor(qty || 1)));
    return this.redis.withLock(`consume:${citizenId}`, 5000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const citizen = await tx.citizen.findUniqueOrThrow({ where: { id: citizenId } });

        if (kind === "FIRST_AID_KIT") {
          if (citizen.firstAidKits < 1) throw new BadRequestException("no first aid kits available");
          const use = Math.min(citizen.firstAidKits, n);
          await tx.citizen.update({
            where: { id: citizenId },
            data: { firstAidKits: { decrement: use }, hp: Math.min(HP_MAX, citizen.hp + 100 * use) },
          });
          return { ok: true, hp: Math.min(HP_MAX, citizen.hp + 100 * use), used: use };
        }

        const isFood = kind === "FOOD";
        const asset: Product = isFood ? "FOOD" : "ENERGY_DRINK";
        const q = Math.min(5, Math.max(1, quality || 1));
        const pantry = citizen.pantryDaysLeft > 0 ? 10 : 0;
        const fridge = citizen.fridgeDaysLeft > 0 ? 10 : 0;
        const hospitalBonus = await this.locationHospitalBonus(citizenId);
        const adWatch = citizen.adWatchOnDay === (await this.game.currentDay()) ? 5 : 0;
        const limit = isFood
          ? FOOD_LIMIT_BASE + pantry + hospitalBonus + adWatch
          : ENERGY_LIMIT_BASE + fridge + hospitalBonus;
        const used = isFood ? citizen.foodUsed : citizen.giftUsed;

        if (used + n > limit) throw new ConflictException(`daily ${isFood ? "food" : "energy drink"} limit exceeded`);

        const has = await this.game.subtractStorage(tx, "CITIZEN", citizenId, asset, q, n);
        if (!has) throw new BadRequestException(`not enough Q${q} ${isFood ? "food" : "energy drink"} in storage`);

        const per = isFood ? FOOD_HP_PER_QUALITY * q : ENERGY_HP_PER_QUALITY * q;
        const hp = Math.min(HP_MAX, citizen.hp + per * n);
        await tx.citizen.update({
          where: { id: citizenId },
          data: {
            hp,
            [isFood ? "foodUsed" : "giftUsed"]: { increment: n },
          },
        });
        return { ok: true, hp, used: used + n, limit };
      }),
    );
  }

  /** Ad watch bonus: +5 food limits, once per day. */
  async watchAd(citizenId: string) {
    const day = await this.game.currentDay();
    return this.redis.withLock(`ad:${citizenId}`, 5000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const citizen = await tx.citizen.findUniqueOrThrow({ where: { id: citizenId } });
        if (citizen.adWatchOnDay === day) throw new ConflictException("ad bonus already claimed today");
        await tx.citizen.update({ where: { id: citizenId }, data: { adWatchOnDay: day } });
        return { ok: true, bonus: "+5 food limits" };
      }),
    );
  }

  /** Repair Pantry with wood (+60 days) or Fridge with stone (+60 days). */
  async repair(citizenId: string, asset: "PANTRY" | "FRIDGE") {
    const repairRaw = asset === "PANTRY" ? "WOOD" : "STONE";
    return this.redis.withLock(`repair:${citizenId}`, 5000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const citizen = await tx.citizen.findUniqueOrThrow({ where: { id: citizenId } });
        if ((asset === "PANTRY" ? citizen.pantryDaysLeft : citizen.fridgeDaysLeft) <= 0) {
          throw new BadRequestException(`no ${asset.toLowerCase()} to repair — buy one on the market`);
        }
        const ok = await this.game.subtractStorage(tx, "CITIZEN", citizenId, repairRaw as Product, 0, 100);
        if (!ok) throw new BadRequestException(`100 ${repairRaw.toLowerCase()} required for repair`);
        await tx.citizen.update({
          where: { id: citizenId },
          data: asset === "PANTRY" ? { pantryDaysLeft: { increment: 60 } } : { fridgeDaysLeft: { increment: 60 } },
        });
        return { ok: true };
      }),
    );
  }
}

function isRawProduct(product: Product): boolean {
  return product === "GRAIN" || product === "SUGAR" || product === "GUNPOWDER" || product === "STONE" || product === "WOOD" || product === "PETROL";
}

function productRaw(product: Exclude<Product, Resource>): Resource {
  switch (product) {
    case "AMMO": return "GUNPOWDER";
    case "FOOD": return "GRAIN";
    case "ENERGY_DRINK": return "SUGAR";
    case "TICKET": return "PETROL";
    case "PANTRY": return "WOOD";
    case "FRIDGE": return "STONE";
    case "HOSPITAL": return "STONE";
    case "FORTIFICATION": return "STONE";
    case "MILITARY_AIR_BASE": return "WOOD";
    case "MILITARY_NAVY_BASE": return "STONE";
    case "FIRST_AID_KIT": return "GRAIN";
    case "SPECIAL_ITEM": return "GRAIN";
  }
}
