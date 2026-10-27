import { BadRequestException } from "@nestjs/common";
import { BuffsService } from "./buffs.service";
import { PrismaService } from "../prisma/prisma.service";
import { GameService } from "../game/game.service";
import { RedisService } from "../redis/redis.service";

describe("BuffsService", () => {
  let service: BuffsService;
  let mockPrisma: any;
  let mockGame: any;
  let mockRedis: any;

  beforeEach(() => {
    mockPrisma = {
      $transaction: jest.fn(async (cb) => cb(mockPrisma)),
      buff: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      citizen: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "c1", premiumDaysLeft: 0 }),
      },
    };

    mockGame = {
      moveGold: jest.fn().mockResolvedValue(true),
      notify: jest.fn().mockResolvedValue(true),
    };

    mockRedis = {
      withLock: jest.fn(async (_key, _ttl, cb) => cb()),
    };

    service = new BuffsService(
      mockPrisma as unknown as PrismaService,
      mockGame as unknown as GameService,
      mockRedis as unknown as RedisService,
    );
  });

  it("throws BadRequestException for unknown buff type", async () => {
    await expect(service.buy("c1", "INVALID_BUFF" as any)).rejects.toThrow(BadRequestException);
  });

  it("activates a buff when citizen has no existing buff", async () => {
    mockPrisma.buff.findFirst.mockResolvedValue(null);

    const res = await service.buy("c1", "STEROID");
    expect(res.ok).toBe(true);
    expect(res.type).toBe("STEROID");
    expect(mockPrisma.buff.create).toHaveBeenCalled();
    expect(mockGame.moveGold).toHaveBeenCalled();
  });

  it("prevents activating buff while the SAME buff is already active", async () => {
    const now = Date.now();
    mockPrisma.buff.findFirst.mockResolvedValue({
      id: "b1",
      citizenId: "c1",
      type: "STEROID",
      buffUntil: new Date(now + 10_000_000), // active
      debuffUntil: new Date(now + 20_000_000),
    });

    await expect(service.buy("c1", "STEROID")).rejects.toThrow("Buff STEROID is already active");
    expect(mockGame.moveGold).not.toHaveBeenCalled();
    expect(mockPrisma.buff.update).not.toHaveBeenCalled();
  });

  it("prevents activating buff while citizen is in DEBUFF for that specified buff", async () => {
    const now = Date.now();
    mockPrisma.buff.findFirst.mockResolvedValue({
      id: "b1",
      citizenId: "c1",
      type: "STEROID",
      buffUntil: new Date(now - 1_000), // buff expired
      debuffUntil: new Date(now + 10_000_000), // debuff active
    });

    await expect(service.buy("c1", "STEROID")).rejects.toThrow("Cannot activate STEROID while in debuff");
    expect(mockGame.moveGold).not.toHaveBeenCalled();
    expect(mockPrisma.buff.update).not.toHaveBeenCalled();
  });

  it("allows re-activating a buff when both buff and debuff have expired", async () => {
    const now = Date.now();
    mockPrisma.buff.findFirst.mockResolvedValue({
      id: "b1",
      citizenId: "c1",
      type: "STEROID",
      buffUntil: new Date(now - 20_000_000),
      debuffUntil: new Date(now - 1_000), // debuff expired
    });

    const res = await service.buy("c1", "STEROID");
    expect(res.ok).toBe(true);
    expect(res.type).toBe("STEROID");
    expect(mockPrisma.buff.update).toHaveBeenCalled();
    expect(mockGame.moveGold).toHaveBeenCalled();
  });
});
