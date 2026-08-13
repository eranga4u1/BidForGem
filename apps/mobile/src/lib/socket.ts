import type {
  AuctionClosedEvent,
  AuctionExtendedEvent,
  BidPlacedEvent,
  UserNotificationEvent,
} from "@gem/types";
import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { SOCKET_URL } from "./config";

export interface AuctionSocketHandlers {
  token?: string | null;
  onBid?: (e: BidPlacedEvent) => void;
  onExtended?: (e: AuctionExtendedEvent) => void;
  onClosed?: (e: AuctionClosedEvent) => void;
  onNotification?: (e: UserNotificationEvent) => void;
  /** Called on every (re)connect — refetch so a missed event can't leave the UI stale. */
  onSync?: () => void;
  onConnectionChange?: (connected: boolean) => void;
}

/**
 * Subscribe to the `/auctions` namespace and (optionally) an auction room.
 * Reconnect is automatic (socket.io); on each connect we re-join and call onSync
 * so a dropped socket during a bid war self-heals. Mirrors the web client.
 */
export function useAuctionSocket(auctionId: string | null, handlers: AuctionSocketHandlers): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const socket: Socket = io(`${SOCKET_URL}/auctions`, {
      transports: ["websocket"],
      auth: handlers.token ? { token: handlers.token } : {},
    });

    socket.on("connect", () => {
      ref.current.onConnectionChange?.(true);
      if (auctionId) socket.emit("join", { auctionId });
      ref.current.onSync?.();
    });
    socket.on("disconnect", () => ref.current.onConnectionChange?.(false));
    socket.on("bid:placed", (e: BidPlacedEvent) => ref.current.onBid?.(e));
    socket.on("auction:extended", (e: AuctionExtendedEvent) => ref.current.onExtended?.(e));
    socket.on("auction:closed", (e: AuctionClosedEvent) => ref.current.onClosed?.(e));
    socket.on("notification", (e: UserNotificationEvent) => ref.current.onNotification?.(e));

    return () => {
      socket.disconnect();
    };
    // Reconnect only when the room or auth identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionId, handlers.token]);
}
