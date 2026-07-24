import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { and, eq, lte, sql } from "drizzle-orm";
import { auctions } from "../../db/schema.js";
import type { Db } from "../../gems/access.js";
import { DB } from "../tokens.js";
import { AuctionCloserService } from "./auction-closer.service.js";

/**
 * Polls for due auctions and closes them. SERVER-driven; candidates are selected
 * by the DATABASE clock and the per-auction lock in closeAuction arbitrates —
 * so this need not be a singleton. Each auction is failure-isolated: one throw
 * does not abort the batch. Structured so it can move to BullMQ later without
 * changing closeAuction.
 */
@Injectable()
export class AuctionScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("AuctionScheduler");
  private timer: NodeJS.Timeout | null = null;
  private readonly intervalMs = Number(process.env.AUCTION_CLOSE_INTERVAL_MS ?? 10_000);
  private readonly batchSize = Number(process.env.AUCTION_CLOSE_BATCH_SIZE ?? 50);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AuctionCloserService) private readonly closer: AuctionCloserService,
  ) {}

  onModuleInit(): void {
    // Opt-in so tests (and one-off processes) don't auto-run the poller.
    if (process.env.AUCTION_SCHEDULER_ENABLED === "true") {
      this.timer = setInterval(() => void this.tick(), this.intervalMs);
      this.logger.log(`Auction close scheduler started (every ${this.intervalMs}ms)`);
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<{ closed: number; aborted: number; failed: number }> {
    const candidates = await this.db
      .select({ id: auctions.id })
      .from(auctions)
      .where(and(eq(auctions.status, "active"), lte(auctions.endAt, sql`now()`)))
      .limit(this.batchSize);

    let closed = 0;
    let aborted = 0;
    let failed = 0;
    for (const candidate of candidates) {
      try {
        const result = await this.closer.close(candidate.id);
        if (result.ok) closed++;
        else aborted++;
      } catch (err) {
        failed++;
        this.logger.error(
          `Failed to close auction ${candidate.id}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
    return { closed, aborted, failed };
  }
}
