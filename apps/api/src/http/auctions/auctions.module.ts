import { Module } from "@nestjs/common";
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
    { provide: NOTIFICATION_DISPATCHER, useClass: SocketNotificationDispatcher },
    AuctionCloserService,
    AuctionScheduler,
  ],
  exports: [AuctionCloserService, AuctionScheduler],
})
export class AuctionsModule {}
