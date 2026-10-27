import { BadRequestException, Controller, Delete, ForbiddenException, Get, Injectable, Module, NotFoundException, Param, Post, Body } from "@nestjs/common";
import { PrismaService, type Tx } from "../prisma/prisma.service";
import { CurrentCitizen } from "../common/current-citizen.decorator";

/** Accepted-friend pair check used by the message gate. */
function pairKey(a: string, b: string) {
  return [a, b].sort().join("|");
}

@Injectable()
export class FriendsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Send a friend request (or auto-accept when the other side already asked). */
  async request(citizenId: string, otherNickname: string) {
    const other = await this.prisma.citizen.findUnique({ where: { nickname: otherNickname }, select: { id: true } });
    if (!other) throw new NotFoundException("citizen not found");
    if (other.id === citizenId) throw new BadRequestException("cannot befriend yourself");
    const reverse = await this.prisma.friendship.findUnique({
      where: { requesterId_addresseeId: { requesterId: other.id, addresseeId: citizenId } },
    });
    if (reverse) {
      return this.prisma.friendship.update({ where: { id: reverse.id }, data: { status: "ACCEPTED" } });
    }
    const existing = await this.prisma.friendship.findUnique({
      where: { requesterId_addresseeId: { requesterId: citizenId, addresseeId: other.id } },
    });
    if (existing) throw new BadRequestException(existing.status === "PENDING" ? "request already sent" : "already friends");
    return this.prisma.friendship.create({ data: { requesterId: citizenId, addresseeId: other.id } });
  }

  async accept(citizenId: string, friendshipId: string) {
    const row = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!row) throw new NotFoundException("friend request not found");
    if (row.addresseeId !== citizenId) throw new ForbiddenException("not your request to accept");
    if (row.status === "ACCEPTED") throw new BadRequestException("already friends");
    return this.prisma.friendship.update({ where: { id: friendshipId }, data: { status: "ACCEPTED" } });
  }

  async remove(citizenId: string, friendshipId: string) {
    const row = await this.prisma.friendship.findUnique({ where: { id: friendshipId } });
    if (!row || (row.requesterId !== citizenId && row.addresseeId !== citizenId)) throw new NotFoundException("friendship not found");
    await this.prisma.friendship.delete({ where: { id: friendshipId } });
    return { ok: true };
  }

  /** Friends + pending incoming/outgoing requests. */
  async list(citizenId: string) {
    const rows = await this.prisma.friendship.findMany({
      where: { OR: [{ requesterId: citizenId }, { addresseeId: citizenId }] },
      orderBy: { createdAt: "desc" },
      include: {
        requester: { select: { id: true, nickname: true, avatarColor: true, level: true } },
        addressee: { select: { id: true, nickname: true, avatarColor: true, level: true } },
      },
    });
    return {
      friends: rows.filter((r) => r.status === "ACCEPTED").map((r) => ({
        id: r.id,
        citizen: r.requesterId === citizenId ? r.addressee : r.requester,
      })),
      incoming: rows.filter((r) => r.status === "PENDING" && r.addresseeId === citizenId).map((r) => ({ id: r.id, from: r.requester })),
      outgoing: rows.filter((r) => r.status === "PENDING" && r.requesterId === citizenId).map((r) => ({ id: r.id, to: r.addressee })),
    };
  }

  /** Send a PM — friends only (wiki: eSocialis mail). */
  async sendMessage(senderId: string, recipientNickname: string, body: string) {
    if (!body?.trim()) throw new BadRequestException("message body required");
    const recipient = await this.prisma.citizen.findUnique({ where: { nickname: recipientNickname }, select: { id: true } });
    if (!recipient) throw new NotFoundException("recipient not found");
    if (recipient.id === senderId) throw new BadRequestException("cannot message yourself");
    const friendship = await this.prisma.friendship.findFirst({
      where: { status: "ACCEPTED", OR: [{ requesterId: senderId, addresseeId: recipient.id }, { requesterId: recipient.id, addresseeId: senderId }] },
      select: { id: true },
    });
    if (!friendship) throw new ForbiddenException("private messages are for friends only");
    return this.prisma.privateMessage.create({ data: { senderId, recipientId: recipient.id, body: body.slice(0, 2000) } });
  }

  /** Thread with a friend + marking inbound messages read. */
  async thread(citizenId: string, partnerNickname: string) {
    const partner = await this.prisma.citizen.findUnique({ where: { nickname: partnerNickname }, select: { id: true, nickname: true } });
    if (!partner) throw new NotFoundException("citizen not found");
    const friendship = await this.prisma.friendship.findFirst({
      where: { status: "ACCEPTED", OR: [{ requesterId: citizenId, addresseeId: partner.id }, { requesterId: partner.id, addresseeId: citizenId }] },
      select: { id: true },
    });
    if (!friendship) throw new ForbiddenException("private messages are for friends only");
    const messages = await this.prisma.privateMessage.findMany({
      where: { OR: [{ senderId: citizenId, recipientId: partner.id }, { senderId: partner.id, recipientId: citizenId }] },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    await this.prisma.privateMessage.updateMany({
      where: { senderId: partner.id, recipientId: citizenId, readAt: null },
      data: { readAt: new Date() },
    });
    return { partner: partner.nickname, messages };
  }

  /** Unread counter for the nav badge. */
  async unread(citizenId: string) {
    return { unread: await this.prisma.privateMessage.count({ where: { recipientId: citizenId, readAt: null } }) };
  }
}

@Controller("friends")
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  list(@CurrentCitizen() citizen: { id: string }) {
    return this.friends.list(citizen.id);
  }

  @Post()
  request(@CurrentCitizen() citizen: { id: string }, @Body() body: { nickname: string }) {
    return this.friends.request(citizen.id, body.nickname);
  }

  @Post(":id/accept")
  accept(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string) {
    return this.friends.accept(citizen.id, id);
  }

  @Delete(":id")
  remove(@CurrentCitizen() citizen: { id: string }, @Param("id") id: string) {
    return this.friends.remove(citizen.id, id);
  }

  /** Inbox: unread counter + threads list (thread contents via /pm/:nickname). */
  @Get("pm/unread")
  unread(@CurrentCitizen() citizen: { id: string }) {
    return this.friends.unread(citizen.id);
  }

  @Post("pm/:nickname")
  send(@CurrentCitizen() citizen: { id: string }, @Param("nickname") nickname: string, @Body() body: { body: string }) {
    return this.friends.sendMessage(citizen.id, nickname, body.body);
  }

  @Get("pm/:nickname")
  thread(@CurrentCitizen() citizen: { id: string }, @Param("nickname") nickname: string) {
    return this.friends.thread(citizen.id, nickname);
  }
}

@Module({
  providers: [FriendsService],
  controllers: [FriendsController],
})
export class FriendsModule {}
