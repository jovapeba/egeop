import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  COMPANY_INDUSTRY_CHANGE_COST,
  COMPANY_RELOCATE_COST,
  COMPANY_RELOCATE_INDUSTRY_COST,
  COMPANY_SALE_MIN_PCT,
  COMPANY_TOTAL_COST,
  COMPANY_UPGRADE_COST,
  COMPANY_WORKER_CAP,
  MAX_PRODUCT_QUALITY,
  RESOURCES,
  RAW_NEED_BASE,
  type Product,
  type Resource,
} from "@egeopolis/game-core";
import { PrismaService, type Tx } from "../prisma/prisma.service";
import { GameService } from "../game/game.service";
import { RedisService } from "../redis/redis.service";

const GOLD = (g: number) => BigInt(Math.round(g * 100));

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService,
    private readonly redis: RedisService,
  ) {}

  mine(citizenId: string) {
    return this.prisma.company.findMany({
      where: { ownerId: citizenId },
      include: { region: { select: { id: true, name: true, resource: true, density: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async detail(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        region: { select: { id: true, name: true, resource: true, density: true, countryId: true } },
        jobOffers: { where: { active: true } },
        employees: { where: { active: true }, include: { citizen: { select: { id: true, nickname: true, ecoSkill: true } } } },
      },
    });
    if (!company) throw new NotFoundException("company not found");
    const storage = await this.prisma.storage.findMany({
      where: { ownerType: "COMPANY", ownerId: companyId },
      orderBy: [{ product: "asc" }, { quality: "asc" }],
    });
    return { company, storage };
  }

  /** Create: 20 gold (wiki). Raw companies require the matching resource in the region. */
  async create(citizenId: string, name: string, product: Product, regionId: string) {
    if (!name?.trim() || name.length < 3) throw new BadRequestException("company name too short");
    const region = await this.prisma.region.findUnique({ where: { id: regionId } });
    if (!region) throw new NotFoundException("region not found");
    if (RESOURCES.includes(product as Resource)) {
      if (region.resource !== product || region.density === "NONE") {
        throw new BadRequestException("raw companies require the matching resource in the region");
      }
    }
    return this.redis.withLock(`gold:${citizenId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        await this.game.moveGold(tx, { type: "CITIZEN", id: citizenId }, null, GOLD(20), "COMPANY_CREATE");
        const company = await tx.company.create({
          data: { name: name.trim(), ownerId: citizenId, ownerType: "CITIZEN", product, quality: 1, regionId },
        });
        await this.game.notify(tx, citizenId, "COMPANY_CREATED", { company: company.name });
        return company;
      }),
    );
  }

  async upgrade(citizenId: string, companyId: string) {
    return this.redis.withLock(`company:${companyId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const company = await this.owned(tx, citizenId, companyId);
        if (company.quality >= MAX_PRODUCT_QUALITY) throw new BadRequestException("already Q5");
        const cost = GOLD(COMPANY_UPGRADE_COST[company.quality]);
        await this.game.moveGold(tx, { type: "CITIZEN", id: citizenId }, null, cost, "COMPANY_UPGRADE");
        return tx.company.update({ where: { id: companyId }, data: { quality: { increment: 1 } } });
      }),
    );
  }

  async downgrade(citizenId: string, companyId: string) {
    return this.redis.withLock(`company:${companyId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const company = await this.owned(tx, citizenId, companyId);
        if (company.quality <= 1) throw new BadRequestException("already Q1");
        // 75% of the invested gold returned (wiki: Company → Downgrading).
        const invested = GOLD(COMPANY_TOTAL_COST[company.quality] - COMPANY_TOTAL_COST[company.quality - 1]);
        await tx.company.update({ where: { id: companyId }, data: { quality: { decrement: 1 } } });
        await this.game.moveGold(tx, null, { type: "CITIZEN", id: citizenId }, (invested * BigInt(75)) / BigInt(100), "OTHER");
        return { ok: true };
      }),
    );
  }

  async relocate(citizenId: string, companyId: string, regionId: string) {
    return this.redis.withLock(`company:${companyId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const company = await this.owned(tx, citizenId, companyId);
        const region = await tx.region.findUnique({ where: { id: regionId } });
        if (!region) throw new NotFoundException("region not found");
        this.assertRegionSupports(company.product, region);
        const cost = GOLD(COMPANY_RELOCATE_COST[company.quality]);
        await this.game.moveGold(tx, { type: "CITIZEN", id: citizenId }, null, cost, "COMPANY_RELOCATE");
        return tx.company.update({ where: { id: companyId }, data: { regionId } });
      }),
    );
  }

  /** Raw companies can only change into other raw companies; product into other products (wiki). */
  async changeIndustry(citizenId: string, companyId: string, product: Product) {
    return this.redis.withLock(`company:${companyId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const company = await this.owned(tx, citizenId, companyId);
        const wasRaw = RESOURCES.includes(company.product as Resource);
        const willBeRaw = RESOURCES.includes(product as Resource);
        if (wasRaw !== willBeRaw) throw new BadRequestException("raw companies change only into raw companies, product into product companies");
        const region = await tx.region.findUniqueOrThrow({ where: { id: company.regionId } });
        this.assertRegionSupports(product, region);
        const cost = GOLD(COMPANY_INDUSTRY_CHANGE_COST[company.quality]);
        await this.game.moveGold(tx, { type: "CITIZEN", id: citizenId }, null, cost, "COMPANY_INDUSTRY");
        return tx.company.update({ where: { id: companyId }, data: { product } });
      }),
    );
  }

  /** Combined relocate + industry transfer at a discounted price (wiki: relocation+industry transfer). */
  async relocateAndChangeIndustry(citizenId: string, companyId: string, regionId: string, product: Product) {
    return this.redis.withLock(`company:${companyId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const company = await this.owned(tx, citizenId, companyId);
        const region = await tx.region.findUnique({ where: { id: regionId } });
        if (!region) throw new NotFoundException("region not found");
        const wasRaw = RESOURCES.includes(company.product as Resource);
        const willBeRaw = RESOURCES.includes(product as Resource);
        if (wasRaw !== willBeRaw) throw new BadRequestException("raw companies change only into raw companies, product into product companies");
        this.assertRegionSupports(product, region);
        const cost = GOLD(COMPANY_RELOCATE_INDUSTRY_COST[company.quality]);
        await this.game.moveGold(tx, { type: "CITIZEN", id: citizenId }, null, cost, "COMPANY_INDUSTRY");
        return tx.company.update({ where: { id: companyId }, data: { regionId, product } });
      }),
    );
  }

  /** Raw companies may only exist in regions holding the matching resource (wiki). */
  private assertRegionSupports(product: Product, region: { resource: string | null; density: string }) {
    if (RESOURCES.includes(product as Resource) && (region.resource !== product || region.density === "NONE")) {
      throw new BadRequestException("raw companies require the matching resource in the region");
    }
  }

  /** Company market listing: 70%–100% of the game-determined value (wiki: Companies for sale). */
  async listForSale(citizenId: string, companyId: string, priceGold: number) {
    return this.redis.withLock(`company:${companyId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const company = await this.owned(tx, citizenId, companyId);
        const value = COMPANY_TOTAL_COST[company.quality];
        const min = value * COMPANY_SALE_MIN_PCT;
        if (priceGold < min) throw new BadRequestException(`minimum sale price is ${min} gold`);
        if (priceGold > value) throw new BadRequestException(`maximum sale price is ${value} gold`);
        return tx.company.update({
          where: { id: companyId },
          data: { forSale: true, salePrice: GOLD(priceGold) },
        });
      }),
    );
  }

  unlistForSale(citizenId: string, companyId: string) {
    return this.redis.withLock(`company:${companyId}`, 5000, () =>
      this.prisma.company.updateMany({
        where: { id: companyId, ownerId: citizenId, forSale: true },
        data: { forSale: false, salePrice: 0 },
      }),
    );
  }

  companyMarket() {
    return this.prisma.company.findMany({
      where: { forSale: true },
      include: { region: { select: { name: true, countryId: true } } },
      orderBy: { salePrice: "asc" },
    });
  }

  async buyCompany(citizenId: string, companyId: string) {
    return this.redis.withLock(`company:${companyId}`, 10000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const company = await tx.company.findUnique({ where: { id: companyId } });
        if (!company || !company.forSale) throw new ConflictException("company not for sale");
        if (company.ownerId === citizenId) throw new BadRequestException("already yours");
        await this.game.moveGold(
          tx,
          { type: "CITIZEN", id: citizenId },
          { type: "CITIZEN", id: company.ownerId },
          company.salePrice,
          "COMPANY_SALE",
        );
        return tx.company.update({
          where: { id: companyId },
          data: { ownerId: citizenId, forSale: false, salePrice: 0 },
        });
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Job market
  // ---------------------------------------------------------------------------

  async jobMarket(countryId?: string, citizenId?: string) {
    const offers = await this.prisma.jobOffer.findMany({
      where: { active: true, company: countryId ? { region: { countryId } } : {} },
      include: {
        company: {
          select: { id: true, name: true, product: true, quality: true, region: { select: { name: true } } },
        },
      },
      orderBy: { salary: "desc" },
      take: 100,
    });

    if (!citizenId) return offers;

    const day = await this.game.currentDay();
    const serverStart = await this.game.serverStart();
    const dayStart = new Date(serverStart + (day - 1) * 86_400_000);

    const activeEmployment = await this.prisma.employment.findFirst({
      where: { citizenId, active: true },
    });

    const hiredTodayRow = await this.prisma.employment.findFirst({
      where: { citizenId, startedAt: { gte: dayStart } },
      select: { id: true },
    });
    const hiredToday = Boolean(hiredTodayRow);

    return offers.map((offer) => {
      const isCurrentJob = activeEmployment?.companyId === offer.companyId;
      return {
        ...offer,
        isCurrentJob,
        hiredToday,
        canApply: !isCurrentJob && !hiredToday,
      };
    });
  }

  async postJob(citizenId: string, companyId: string, minEcoSkill: number, salary: number) {
    return this.redis.withLock(`company:${companyId}`, 6000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const company = await this.owned(tx, citizenId, companyId);
        if (salary <= 0) throw new BadRequestException("salary must be positive");
        await tx.jobOffer.updateMany({ where: { companyId, active: true }, data: { active: false } });
        return tx.jobOffer.create({
          data: { companyId: company.id, minEcoSkill: Math.max(1, minEcoSkill || 1), salary: BigInt(Math.round(salary * 100)) },
        });
      }),
    );
  }

  async applyJob(citizenId: string, offerId: string) {
    return this.redis.withLock(`job:${citizenId}`, 6000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const offer = await tx.jobOffer.findUnique({ where: { id: offerId }, include: { company: true } });
        if (!offer || !offer.active) throw new ConflictException("job offer not active");
        const citizen = await tx.citizen.findUniqueOrThrow({ where: { id: citizenId } });
        if (citizen.ecoSkill < offer.minEcoSkill) throw new BadRequestException("eco skill below requirement");

        const day = await this.game.currentDay();
        const serverStart = await this.game.serverStart();
        const dayStart = new Date(serverStart + (day - 1) * 86_400_000);

        // Check if citizen is already employed at this exact company
        const activeEmployment = await tx.employment.findFirst({
          where: { citizenId, active: true },
        });
        if (activeEmployment && activeEmployment.companyId === offer.companyId) {
          throw new ConflictException("already employed at this company");
        }

        // Rule: If you applied for a job today and got hired, you cannot switch jobs the same day
        const hiredToday = await tx.employment.findFirst({
          where: { citizenId, startedAt: { gte: dayStart } },
          orderBy: { startedAt: "desc" },
        });
        if (hiredToday) {
          throw new ConflictException("You were already hired today. You cannot switch jobs on the same day.");
        }

        const workers = await tx.employment.count({ where: { companyId: offer.companyId, active: true } });
        if (workers >= COMPANY_WORKER_CAP) throw new ConflictException(`company worker limit is ${COMPANY_WORKER_CAP}`);
        const embargo = await tx.embargo.findFirst({
          where: { targetCountryId: citizen.citizenshipCountryId, type: "JOB", active: true, until: { gt: new Date() } },
          select: { id: true },
        });
        if (embargo) throw new ForbiddenException("your country is under a job embargo");
        await tx.employment.updateMany({ where: { citizenId, active: true }, data: { active: false } });
        return tx.employment.create({
          data: { citizenId, companyId: offer.companyId, salary: offer.salary },
        });
      }),
    );
  }

  async quitJob(citizenId: string) {
    const day = await this.game.currentDay();
    const serverStart = await this.game.serverStart();
    const dayStart = new Date(serverStart + (day - 1) * 86_400_000);

    const activeEmployment = await this.prisma.employment.findFirst({
      where: { citizenId, active: true },
    });
    if (!activeEmployment) {
      throw new BadRequestException("no active job to quit");
    }
    if (activeEmployment.startedAt >= dayStart) {
      throw new ConflictException("You cannot quit your job on the same day you were hired.");
    }

    await this.prisma.employment.updateMany({ where: { citizenId, active: true }, data: { active: false } });
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Company storage transfers
  // ---------------------------------------------------------------------------

  async withdraw(citizenId: string, companyId: string, product: Product, quality: number, qty: number) {
    return this.redis.withLock(`company:${companyId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        await this.owned(tx, citizenId, companyId);
        const took = await this.game.subtractStorage(tx, "COMPANY", companyId, product, quality, qty);
        if (!took) throw new BadRequestException("insufficient company stock");
        await this.game.addStorage(tx, "CITIZEN", citizenId, product, quality, qty);
        return { ok: true };
      }),
    );
  }

  async deposit(citizenId: string, companyId: string, product: Product, quality: number, qty: number) {
    return this.redis.withLock(`company:${companyId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        await this.owned(tx, citizenId, companyId);
        const took = await this.game.subtractStorage(tx, "CITIZEN", citizenId, product, quality, qty);
        if (!took) throw new BadRequestException("insufficient personal stock");
        await this.game.addStorage(tx, "COMPANY", companyId, product, quality, qty);
        return { ok: true };
      }),
    );
  }

  async withdrawFiat(citizenId: string, companyId: string, amount: number) {
    return this.redis.withLock(`company:${companyId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const company = await this.owned(tx, citizenId, companyId);
        const cents = BigInt(Math.round(amount * 100));
        await this.game.companyWalletMove(tx, companyId, -cents, "OTHER");
        const region = await tx.region.findUnique({ where: { id: company.regionId } });
        await this.game.walletCredit(tx, citizenId, region!.countryId, cents, "OTHER");
        return { ok: true };
      }),
    );
  }

  async depositFiat(citizenId: string, companyId: string, amount: number) {
    return this.redis.withLock(`company:${companyId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const company = await this.owned(tx, citizenId, companyId);
        const region = await tx.region.findUniqueOrThrow({ where: { id: company.regionId } });
        const cents = BigInt(Math.round(amount * 100));
        await this.game.walletDebit(tx, citizenId, region.countryId, cents, "OTHER");
        await this.game.companyWalletMove(tx, companyId, cents, "OTHER", region.countryId);
        return { ok: true };
      }),
    );
  }

  rawNeedsTable() {
    return RAW_NEED_BASE;
  }

  private async owned(tx: Tx, citizenId: string, companyId: string) {
    const company = await tx.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException("company not found");
    if (company.ownerId !== citizenId) throw new ForbiddenException("not the company owner");
    return company;
  }
}
