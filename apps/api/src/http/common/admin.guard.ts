import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { AuthConfig } from "../../auth/config.js";
import { authenticate } from "../../auth/guard.js";
import type { Db } from "../../gems/access.js";
import { AUTH_CONFIG, DB } from "../tokens.js";
import type { AuthedRequest } from "./auth.guard.js";
import { httpForReason } from "./error-envelope.js";

/** Requires a valid access token AND the admin role. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const result = await authenticate(
      { db: this.db, config: this.config },
      req.headers.authorization,
    );
    if (!result.ok) throw httpForReason(result.reason);
    if (result.user.role !== "admin") throw httpForReason("FORBIDDEN");
    req.user = result.user;
    return true;
  }
}
