import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { and, asc, eq, lte, sql } from "drizzle-orm";
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
 *
 * Scheduling is ADAPTIVE rather than a fixed interval: after each pass we sleep
 * only until the soonest active auction's end time, clamped to [min, max]. When
 * nothing is active we sleep the full `maxDelayMs`. This lets a serverless
 * database (e.g. Neon) idle / scale-to-zero between wake-ups instead of being
 * pinned awake 24/7 by a tight poll — dramatically cutting compute cost. The
 * `maxDelayMs` cap doubles as the safety net that bounds how late a newly
 * created short auction can be closed, so raise it only as far as your shortest
 * auction duration allows.
 */
@Injectable()
export class AuctionScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("AuctionScheduler");
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private cycling = false;
  /** Floor between wake-ups — avoids a hot loop when something is due right now. */
  private readonly minDelayMs = Number(process.env.AUCTION_CLOSE_MIN_DELAY_MS ?? 1_000);
  /**
   * Ceiling on a single sleep. Longer = the DB idles more between wake-ups (cheaper),
   * but also the longest a freshly created auction can wait before it's noticed.
   * Back-compat: falls back to the old fixed-interval env var, then 10 minutes.
   */
  private readonly maxDelayMs = Number(
    process.env.AUCTION_CLOSE_MAX_DELAY_MS ?? process.env.AUCTION_CLOSE_INTERVAL_MS ?? 600_000,
  );
  private readonly batchSize = Number(process.env.AUCTION_CLOSE_BATCH_SIZE ?? 50);

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AuctionCloserService) private readonly closer: AuctionCloserService,
  ) {}

  onModuleInit(): void {
    // Opt-in so tests (and one-off processes) don't auto-run the poller.
    if (process.env.AUCTION_SCHEDULER_ENABLED === "true") {
      this.logger.log(`Auction close scheduler started (adaptive, max ${this.maxDelayMs}ms)`);
      void this.cycle();
    }
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  /**
   * Re-arm immediately. Safe to call after creating/starting an auction so its
   * close is scheduled without waiting for the current sleep to lapse. Best
   * effort: if a cycle is already in flight it will pick up the new row anyway.
   */
  kick(): void {
    if (this.stopped || process.env.AUCTION_SCHEDULER_ENABLED !== "true") return;
    void this.cycle();
  }

  /** Run one close pass, then sleep until the next one is due. Self-rescheduling. */
  private async cycle(): Promise<void> {
    if (this.stopped || this.cycling) return;
    this.cycling = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    let delay = this.maxDelayMs;
    try {
      await this.tick();
      delay = await this.nextDelayMs();
    } catch (err) {
      this.logger.error("scheduler cycle failed", err instanceof Error ? err.stack : String(err));
    } finally {
      this.cycling = false;
      if (!this.stopped) this.timer = setTimeout(() => void this.cycle(), delay);
    }
  }

  /** Milliseconds until the soonest active auction ends, clamped to [min, max]. */
  async nextDelayMs(): Promise<number> {
    const [next] = await this.db
      .select({ endAt: auctions.endAt })
      .from(auctions)
      .where(eq(auctions.status, "active"))
      .orderBy(asc(auctions.endAt))
      .limit(1);
    if (!next) return this.maxDelayMs;
    const untilDue = next.endAt.getTime() - Date.now();
    return Math.min(this.maxDelayMs, Math.max(this.minDelayMs, untilDue));
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
