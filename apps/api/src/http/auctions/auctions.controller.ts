import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import { placeBidInputSchema, type PublicUser } from "@gem/types";
import type { AuctionsService } from "../../auctions/auctions-service.js";
import { toPublicAuction } from "../../auctions/mappers.js";
import type { RateLimiter } from "../../auth/rate-limit.js";
import { placeBid } from "../../bidding/place-bid.js";
import { auctions, bids } from "../../db/schema.js";
import type { Db } from "../../gems/access.js";
import { AuthGuard } from "../common/auth.guard.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { httpForReason } from "../common/error-envelope.js";
import { unwrap } from "../common/respond.js";
import { AUCTIONS_SERVICE, DB, RATE_LIMITER } from "../tokens.js";
import { AuctionsGateway } from "./auctions.gateway.js";

const BID_PER_USER = { limit: 30, windowMs: 60_000 };
const BID_PER_IP = { limit: 120, windowMs: 60_000 };

@Controller("auctions")
export class AuctionsController {
  constructor(
    @Inject(AUCTIONS_SERVICE) private readonly auctions: AuctionsService,
    @Inject(DB) private readonly db: Db,
    @Inject(RATE_LIMITER) private readonly rateLimiter: RateLimiter,
    @Inject(AuctionsGateway) private readonly gateway: AuctionsGateway,
  ) {}

  @Post()
  @UseGuards(AuthGuard)
  async create(@CurrentUser() user: PublicUser, @Body() body: unknown) {
    return unwrap(await this.auctions.create(user.id, body));
  }

  @Get()
  async list(@Query() query: unknown) {
    return unwrap(await this.auctions.list(query));
  }

  @Get(":id")
  async get(@Param("id") id: string) {
    return unwrap(await this.auctions.get(id));
  }

  @Get(":id/bids")
  async history(@Param("id") id: string, @Query() query: unknown) {
    return unwrap(await this.auctions.bidHistory(id, query));
  }

  @Post(":id/cancel")
  @UseGuards(AuthGuard)
  async cancel(@CurrentUser() user: PublicUser, @Param("id") id: string) {
    return unwrap(await this.auctions.cancel(user.id, id));
  }

  /**
   * THIN wrapper: authenticate -> validate -> placeBid (all correctness lives in
   * that transactional function) -> map rejection -> broadcast AFTER commit.
   */
  @Post(":id/bids")
  @UseGuards(AuthGuard)
  async placeBid(
    @CurrentUser() user: PublicUser,
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const ip = req.ip ?? "unknown";
    if (
      !this.rateLimiter.hit(`bid:user:${user.id}`, BID_PER_USER.limit, BID_PER_USER.windowMs) ||
      !this.rateLimiter.hit(`bid:ip:${ip}`, BID_PER_IP.limit, BID_PER_IP.windowMs)
    ) {
      throw httpForReason("RATE_LIMITED");
    }

    const parsed = placeBidInputSchema.safeParse(body);
    if (!parsed.success) throw httpForReason("INVALID_INPUT", parsed.error.issues);

    // Capture end_at before the bid so we can detect an anti-snipe extension.
    const [pre] = await this.db
      .select({ endAt: auctions.endAt })
      .from(auctions)
      .where(eq(auctions.id, id))
      .limit(1);

    const result = await placeBid(this.db, {
      auctionId: id,
      bidderId: user.id,
      amount: parsed.data.amount,
    });
    if (!result.ok) throw httpForReason(result.reason);

    // Broadcast only after the transaction has committed. No PII — display name only.
    const bidCount = await this.db.$count(bids, eq(bids.auctionId, id));
    const endAtIso = result.auction.endAt.toISOString();
    this.gateway.emitBidPlaced({
      auctionId: id,
      amount: result.bid.amount,
      bidderDisplayName: user.name,
      highestBid: result.auction.highestBid ?? result.bid.amount,
      bidCount,
      endAt: endAtIso,
    });
    if (pre && pre.endAt.getTime() !== result.auction.endAt.getTime()) {
      this.gateway.emitAuctionExtended({ auctionId: id, endAt: endAtIso });
    }

    return { ok: true, auction: toPublicAuction(result.auction, bidCount) };
  }
}
