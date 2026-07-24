import { Inject } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import type {
  AuctionClosedEvent,
  AuctionExtendedEvent,
  BidPlacedEvent,
  UserNotificationEvent,
} from "@gem/types";
import type { AuthConfig } from "../../auth/config.js";
import { extractBearerToken } from "../../auth/guard.js";
import { verifyAccessToken } from "../../auth/tokens.js";
import { AUTH_CONFIG } from "../tokens.js";

/**
 * Real-time auction updates. One room per auction (`auction:<id>`). Reading is
 * unauthenticated; bids are placed over HTTP, never accepted here.
 *
 * Broadcasts go through `this.server.to(room).emit(...)`, which is adapter-
 * agnostic — dropping in the Socket.IO Redis adapter at bootstrap enables
 * multi-instance fan-out with NO changes to this class.
 */
@WebSocketGateway({ namespace: "/auctions", cors: { origin: true } })
export class AuctionsGateway implements OnGatewayConnection {
  @WebSocketServer() private readonly server!: Server;

  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  async handleConnection(socket: Socket): Promise<void> {
    // Optional handshake auth: attach identity if a valid token is present, so
    // future user-scoped events (e.g. outbid notices) have it available.
    const auth = socket.handshake.auth as { token?: unknown };
    const authToken = typeof auth.token === "string" ? auth.token : null;
    const token = authToken ?? extractBearerToken(socket.handshake.headers.authorization);
    if (!token) return;
    const verified = await verifyAccessToken(this.config, token);
    if (verified.ok) {
      (socket.data as { userId?: string }).userId = verified.claims.sub;
      // Join a per-user room so we can push user-scoped events (outbid/won).
      void socket.join(`user:${verified.claims.sub}`);
    }
  }

  @SubscribeMessage("join")
  join(@MessageBody() body: { auctionId?: unknown }, @ConnectedSocket() socket: Socket) {
    const auctionId = typeof body.auctionId === "string" ? body.auctionId : null;
    if (!auctionId) return { ok: false };
    void socket.join(`auction:${auctionId}`);
    return { ok: true };
  }

  @SubscribeMessage("leave")
  leave(@MessageBody() body: { auctionId?: unknown }, @ConnectedSocket() socket: Socket) {
    const auctionId = typeof body.auctionId === "string" ? body.auctionId : null;
    if (auctionId) void socket.leave(`auction:${auctionId}`);
    return { ok: true };
  }

  emitBidPlaced(payload: BidPlacedEvent): void {
    this.server.to(`auction:${payload.auctionId}`).emit("bid:placed", payload);
  }

  emitAuctionExtended(payload: AuctionExtendedEvent): void {
    this.server.to(`auction:${payload.auctionId}`).emit("auction:extended", payload);
  }

  emitAuctionClosed(payload: AuctionClosedEvent): void {
    this.server.to(`auction:${payload.auctionId}`).emit("auction:closed", payload);
  }

  /** Push a user-scoped notification to only that user's sockets. */
  emitToUser(userId: string, event: UserNotificationEvent): void {
    this.server.to(`user:${userId}`).emit("notification", event);
  }
}
