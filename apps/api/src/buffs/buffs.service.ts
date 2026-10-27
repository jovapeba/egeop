import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import {
  BUFFS,
  BUFF_COST_GOLD,
  BUFF_DAMAGE_BONUS,
  BUFF_DURATION_HOURS,
  DEBUFF_DURATION_HOURS,
  DEBUFF_DURATION_HOURS_PREMIUM,
  type BuffType,
} from "@egeopolis/game-core";
import { PrismaService, type Tx } from "../prisma/prisma.service";
import { GameService } from "../game/game.service";
import { RedisService } from "../redis/redis.service";

const GOLD = (g: number) => BigInt(Math.round(g * 100));

export const BUFF_DESCRIPTIONS: Record<BuffType, string> = {
  STEROID: "+10% damage for 24h",
  RAMBO: "+10% damage with Q5 ammo for 24h",
  PATRIOT: "+10% damage defending a core region for 24h",
  REBEL: "+10% damage in resistance wars on core regions for 24h",
};

@Injectable()
export class BuffsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly game: GameService,
    private readonly redis: RedisService,
  ) {}

  /** Active buffs + pending debuffs for the citizen. */
  async mine(citizenId: string) {
    const now = new Date();
    const buffs = await this.prisma.buff.findMany({
      where: { citizenId, OR: [{ buffUntil: { gt: now } }, { debuffUntil: { gt: now } }] },
      orderBy: { buffUntil: "desc" },
    });
    return buffs.map((b) => ({
      type: b.type,
      buffed: b.buffUntil > now,
      buffUntil: b.buffUntil,
      debuffed: b.buffUntil <= now && b.debuffUntil > now,
      debuffUntil: b.debuffUntil,
      description: BUFF_DESCRIPTIONS[b.type],
      damageBonus: b.buffUntil > now ? BUFF_DAMAGE_BONUS : -BUFF_DAMAGE_BONUS,
    }));
  }

  /**
   * Buy & activate a buff (1g). Buff 24h → debuff 24h (premium) / 48h (non-prem).
   * Cannot activate if the same buff is already active or currently in debuff.
   */
  async buy(citizenId: string, type: BuffType) {
    if (!(BUFFS as readonly string[]).includes(type)) {
      throw new BadRequestException(`unknown buff — one of ${BUFFS.join(", ")}`);
    }
    return this.redis.withLock(`gold:${citizenId}`, 8000, () =>
      this.prisma.$transaction(async (tx: Tx) => {
        const citizen = await tx.citizen.findUniqueOrThrow({ where: { id: citizenId }, select: { id: true, premiumDaysLeft: true } });

        const now = Date.now();
        const existing = await tx.buff.findFirst({ where: { citizenId, type } });
        if (existing) {
          if (existing.buffUntil.getTime() > now) {
            throw new BadRequestException(`Buff ${type} is already active`);
          }
          if (existing.debuffUntil.getTime() > now) {
            throw new BadRequestException(`Cannot activate ${type} while in debuff`);
          }
        }

        await this.game.moveGold(tx, { type: "CITIZEN", id: citizenId }, null, GOLD(BUFF_COST_GOLD), "OTHER", { buff: type });

        const buffUntil = new Date(now + BUFF_DURATION_HOURS * 3600_000);
        const debuffHours = citizen.premiumDaysLeft > 0 ? DEBUFF_DURATION_HOURS_PREMIUM : DEBUFF_DURATION_HOURS;
        const debuffUntil = new Date(buffUntil.getTime() + debuffHours * 3600_000);

        if (existing) {
          await tx.buff.update({ where: { id: existing.id }, data: { buffUntil, debuffUntil } });
        } else {
          await tx.buff.create({ data: { citizenId, type, buffUntil, debuffUntil } });
        }
        await this.game.notify(tx, citizenId, "BUFF_ACTIVATED", { type, buffUntil, debuffUntil });
        return { ok: true, type, buffUntil, debuffUntil, debuffHours };
      }),
    );
  }
}
