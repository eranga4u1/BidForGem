import { Module } from "@nestjs/common";
import { CompositeNotificationDispatcher } from "../notifications/composite-dispatcher.js";
import { EmailNotifier } from "../notifications/email-notifier.js";
import { SocketNotificationDispatcher } from "../notifications/socket-dispatcher.js";
import { NOTIFICATION_DISPATCHER } from "../tokens.js";
import { AuctionCloserService } from "./auction-closer.service.js";
import { AuctionScheduler } from "./auction-scheduler.service.js";
import { AuctionsController } from "./auctions.controller.js";
import { AuctionsGateway } from "./auctions.gateway.js";

@Module({
  controllers: [AuctionsController],
  providers: [
    AuctionsGateway,
    // In-app (socket) + email compose into the one dispatcher the app injects.
    SocketNotificationDispatcher,
    EmailNotifier,
    { provide: NOTIFICATION_DISPATCHER, useClass: CompositeNotificationDispatcher },
    AuctionCloserService,
    AuctionScheduler,
  ],
  exports: [AuctionCloserService, AuctionScheduler],
})
export class AuctionsModule {}
