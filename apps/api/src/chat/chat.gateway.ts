import { Logger } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { RedisService } from "../redis/redis.service";
import { PrismaService } from "../prisma/prisma.service";
import { ChatService } from "./chat.service";

@WebSocketGateway({ cors: { origin: "*" }, transports: ["websocket"] })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly chatService: ChatService,
  ) {}

  async afterInit() {
    await this.redis.onChatEvent((countryId, event: any) => {
      const payload = event?.message ?? event;
      this.server.to(`chat:country:${countryId}`).emit("chat:message", payload);
    });
    this.logger.log("country chat events wired to socket rooms");
  }

  handleConnection(socket: Socket) {
    void socket;
  }

  handleDisconnect(socket: Socket) {
    void socket;
  }

  private async getCitizenFromToken(token?: string) {
    if (!token) return null;
    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: process.env.JWT_SECRET || "dev-secret-change-me",
      });
      if (!payload?.sub) return null;
      return this.prisma.citizen.findUnique({
        where: { id: payload.sub },
        select: { id: true, citizenshipCountryId: true },
      });
    } catch {
      return null;
    }
  }

  @SubscribeMessage("chat:join")
  async handleJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { countryId: string; token?: string },
  ) {
    const token =
      body?.token ||
      socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization
        ? String(socket.handshake.headers.authorization).replace("Bearer ", "")
        : undefined);
    const citizen = await this.getCitizenFromToken(token);

    if (!citizen) {
      return { ok: false, error: "Authentication required" };
    }

    if (citizen.citizenshipCountryId !== body?.countryId) {
      return { ok: false, error: "Access denied: You are not a citizen of this country" };
    }

    const room = `chat:country:${body.countryId}`;
    await socket.join(room);
    return { ok: true, room, countryId: body.countryId };
  }

  @SubscribeMessage("chat:leave")
  async handleLeave(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { countryId: string },
  ) {
    if (!body?.countryId) return { ok: false };
    await socket.leave(`chat:country:${body.countryId}`);
    return { ok: true };
  }

  @SubscribeMessage("chat:send")
  async handleSend(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { countryId: string; content: string; token?: string },
  ) {
    const token =
      body?.token ||
      socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization
        ? String(socket.handshake.headers.authorization).replace("Bearer ", "")
        : undefined);
    const citizen = await this.getCitizenFromToken(token);

    if (!citizen) {
      return { ok: false, error: "Authentication required" };
    }

    if (citizen.citizenshipCountryId !== body?.countryId) {
      return { ok: false, error: "Access denied: You are not a citizen of this country" };
    }

    try {
      const message = await this.chatService.sendMessage(
        citizen,
        body.countryId,
        body.content,
      );
      return { ok: true, message };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
}
