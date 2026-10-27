import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getMessages(
    citizen: { id: string; citizenshipCountryId: string },
    countryId: string,
    limit = 50,
  ) {
    if (citizen.citizenshipCountryId !== countryId) {
      throw new ForbiddenException("Access denied: You can only access the chat of your own citizenship country.");
    }

    const messages = await this.prisma.countryChatMessage.findMany({
      where: { countryId },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            avatarColor: true,
            level: true,
            citizenshipCountry: {
              select: { id: true, name: true, code: true, flagColor: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(100, Math.max(1, limit)),
    });

    return messages.reverse();
  }

  async sendMessage(
    citizen: { id: string; citizenshipCountryId: string },
    countryId: string,
    content: string,
  ) {
    if (citizen.citizenshipCountryId !== countryId) {
      throw new ForbiddenException("Access denied: You cannot send messages to another country's chat.");
    }

    const text = (content ?? "").trim();
    if (!text) {
      throw new BadRequestException("Message content cannot be empty.");
    }
    if (text.length > 500) {
      throw new BadRequestException("Message cannot exceed 500 characters.");
    }

    const message = await this.prisma.countryChatMessage.create({
      data: {
        countryId,
        authorId: citizen.id,
        content: text,
      },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            avatarColor: true,
            level: true,
            citizenshipCountry: {
              select: { id: true, name: true, code: true, flagColor: true },
            },
          },
        },
      },
    });

    // Publish to Redis for multi-instance socket broadcasting
    await this.redis.publish(`chat:country:${countryId}`, {
      type: "message",
      countryId,
      message,
    });

    return message;
  }
}
