import { Controller, Get, HttpException, Inject } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Db } from "../../gems/access.js";
import { envelope } from "../common/error-envelope.js";
import { DB } from "../tokens.js";

@Controller("health")
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Get()
  async check() {
    try {
      await this.db.execute(sql`select 1`);
      return { status: "ok" };
    } catch {
      throw new HttpException(envelope("DB_UNAVAILABLE", "Database unavailable."), 503);
    }
  }
}
