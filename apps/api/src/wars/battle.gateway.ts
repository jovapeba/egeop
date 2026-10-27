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
import { RedisService } from "../redis/redis.service";

/**
 * Live battle gateway: clients join `battle:{id}` rooms; every hit publishes a
 * wall update + hit feed via Redis pub/sub (multi-instance safe).
 */
@WebSocketGateway({ cors: { origin: "*" }, transports: ["websocket"] })
export class BattleGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(BattleGateway.name);

  constructor(private readonly redis: RedisService) {}

  async afterInit() {
    await this.redis.onBattleEvent((battleId, event) => {
      this.server.to(`battle:${battleId}`).emit("battle:event", event);
    });
    this.logger.log("battle events wired to socket rooms");
  }

  handleConnection(socket: Socket) {
    void socket;
  }

  handleDisconnect(socket: Socket) {
    void socket;
  }

  @SubscribeMessage("battle:join")
  join(@ConnectedSocket() socket: Socket, @MessageBody() body: { battleId: string }) {
    if (!body?.battleId) return { ok: false };
    const room = `battle:${body.battleId}`;
    void socket.join(room);
    return { ok: true, room };
  }

  @SubscribeMessage("battle:leave")
  leave(@ConnectedSocket() socket: Socket, @MessageBody() body: { battleId: string }) {
    if (!body?.battleId) return { ok: false };
    void socket.leave(`battle:${body.battleId}`);
    return { ok: true };
  }
}
