import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import {
  FOOD_LIMIT_BASE,
  ENERGY_LIMIT_BASE,
  HP_MAX,
  militaryRank,
  STARTER_GOLD,
  STARTER_ITEMS,
} from "@egeopolis/game-core";
import { PrismaService, type Tx } from "../prisma/prisma.service";
import { GameService } from "../game/game.service";

export interface RegisterDto {
  email: string;
  password: string;
  nickname: string;
  countryId?: string;
  referralCode?: string;
  sharedIpNickname?: string;
}
export interface LoginDto {
  email: string;
  password: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly game: GameService,
  ) {}

  async countries() {
    return this.prisma.country.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        code: true,
        flagColor: true,
        currencyName: true,
        currencySymbol: true,
        _count: {
          select: { citizens: true, regions: true },
        },
      },
      orderBy: { name: "asc" },
    });
  }

  async register(dto: RegisterDto) {
    const email = dto.email?.trim().toLowerCase();
    const nickname = dto.nickname?.trim();
    if (!email || !email.includes("@")) throw new BadRequestException("valid email required");
    if (!passwordStrong(dto.password)) throw new BadRequestException("password must be at least 6 characters");
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(nickname ?? "")) {
      throw new BadRequestException("nickname must be 3-20 chars (a-z, 0-9, _)");
    }

    const existing = await this.prisma.citizen.findFirst({
      where: { OR: [{ email }, { nickname }] },
      select: { id: true },
    });
    if (existing) throw new ConflictException("email or nickname already registered");

    // Shared IP registration validation (wiki)
    let sharedAccount: { id: string; nickname: string; lastIp: string | null } | null = null;
    if (dto.sharedIpNickname && dto.sharedIpNickname.trim().length > 0) {
      const match = await this.prisma.citizen.findUnique({
        where: { nickname: dto.sharedIpNickname.trim() },
        select: { id: true, nickname: true, lastIp: true },
      });
      if (!match) throw new BadRequestException(`Second account on same IP "${dto.sharedIpNickname}" not found`);
      const dupes = await this.prisma.sharedIpRegistration.count({
        where: { OR: [{ mainId: match.id }, { sharedId: match.id }] },
      });
      if (dupes > 0) throw new ConflictException("Second account is already in the shared-IP registry (limit is 2 per IP)");
      sharedAccount = match;
    }

    // Settle into the user's chosen country, or least-populated active country if omitted.
    const countries = await this.prisma.country.findMany({
      where: { active: true },
      orderBy: { id: "asc" },
      include: {
        regions: { select: { id: true, isCapital: true } },
        _count: { select: { citizens: true } },
      },
    });
    if (countries.length === 0) throw new ConflictException("world not initialized");

    let country: (typeof countries)[number];
    if (dto.countryId) {
      const match = countries.find((c) => c.id === dto.countryId);
      if (!match) throw new BadRequestException("selected country does not exist or is inactive");
      country = match;
    } else {
      countries.sort((a, b) => a._count.citizens - b._count.citizens);
      country = countries[0];
    }

    const capital = country.regions.find((r) => r.isCapital) ?? country.regions[0];
    if (!capital) throw new ConflictException("country has no capital or regions");

    let referrerId: string | null = null;
    // Shared IP accounts cannot be referrals to anyone (wiki)
    if (!sharedAccount && dto.referralCode) {
      const referrer = await this.prisma.citizen.findUnique({
        where: { referralCode: dto.referralCode },
        select: { id: true },
      });
      if (referrer) referrerId = referrer.id;
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const citizen = await this.prisma.citizen.create({
      data: {
        email,
        passwordHash,
        nickname,
        level: 1,
        xp: 0,
        hp: 50,
        strength: 10,
        ecoSkill: 1,
        gold: BigInt(STARTER_GOLD) * BigInt(100),
        citizenshipCountryId: country.id,
        locationRegionId: capital.id,
        referrerId,
      },
    });

    if (sharedAccount) {
      await this.prisma.sharedIpRegistration.create({
        data: {
          mainId: sharedAccount.id,
          sharedId: citizen.id,
          ip: sharedAccount.lastIp ?? "127.0.0.1",
        },
      });
    }

    await this.prisma.$transaction(async (tx: Tx) => {
      for (const item of STARTER_ITEMS) {
        await this.game.addStorage(tx, "CITIZEN", citizen.id, item.product, item.quality, item.qty);
      }
      // Starter fiat wallet in the home currency (500 CC).
      await this.game.walletCredit(tx, citizen.id, country.id, BigInt(500) * BigInt(100), "STARTER");
      await this.game.notify(tx, citizen.id, "WELCOME", { country: country.name });
    });
    return this.issueToken(citizen.id);
  }

  async login(dto: LoginDto, ip?: string) {
    const citizen = await this.prisma.citizen.findUnique({
      where: { email: dto.email?.trim().toLowerCase() },
    });
    if (!citizen) throw new UnauthorizedException("invalid credentials");
    const ok = await bcrypt.compare(dto.password ?? "", citizen.passwordHash);
    if (!ok) throw new UnauthorizedException("invalid credentials");
    await this.prisma.citizen.update({
      where: { id: citizen.id },
      data: { lastSeenAt: new Date(), ...(ip && ip !== citizen.lastIp ? { lastIp: ip } : {}) },
    });
    return this.issueToken(citizen.id);
  }

  async me(citizenId: string) {
    const citizen = await this.prisma.citizen.findUniqueOrThrow({
      where: { id: citizenId },
      include: {
        citizenshipCountry: true,
        locationRegion: true,
      },
    });
    const rank = militaryRank(Number(citizen.totalDamage));
    const bestPantry = citizen.pantryDaysLeft > 0 ? 10 : 0;
    const bestFridge = citizen.fridgeDaysLeft > 0 ? 10 : 0;
    const medalCount = await this.prisma.medal.count({ where: { citizenId } });
    // Native-currency balance: the fiat wallet of the citizenship country.
    const wallet = await this.prisma.citizenWallet.findUnique({
      where: { citizenId_countryId: { citizenId, countryId: citizen.citizenshipCountryId } },
      select: { amount: true },
    });
    const { passwordHash: _hash, ...safe } = citizen;
    return {
      ...safe,
      militaryRank: rank,
      foodLimit: FOOD_LIMIT_BASE + bestPantry + citizen.foodLimitExtra,
      energyLimit: ENERGY_LIMIT_BASE + bestFridge + citizen.giftLimitExtra,
      medalCount,
      walletFiat: wallet?.amount ?? BigInt(0),
    };
  }

  private async issueToken(citizenId: string) {
    return { accessToken: await this.jwt.signAsync({ sub: citizenId }) };
  }
}

function passwordStrong(password?: string) {
  return typeof password === "string" && password.length >= 6;
}

export { HP_MAX };
