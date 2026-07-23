import { Module } from "@nestjs/common";
import { AuctionsController } from "./auctions.controller.js";
import { AuctionsGateway } from "./auctions.gateway.js";

@Module({
  controllers: [AuctionsController],
  providers: [AuctionsGateway],
})
export class AuctionsModule {}
