import { type CanActivate, type ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import type { PublicUser } from "@gem/types";
import type { AuthConfig } from "../../auth/config.js";
import { authenticate } from "../../auth/guard.js";
import type { Db } from "../../gems/access.js";
import { AUTH_CONFIG, DB } from "../tokens.js";
import { httpForReason } from "./error-envelope.js";

export type AuthedRequest = Request & { user?: PublicUser };

/** Requires a valid access token; attaches the user to the request. */
@Injectable()
export class AuthGuard implements CanActivate {
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
    req.user = result.user;
    return true;
  }
}

/** Attaches the user when a valid token is present, but never blocks the request. */
@Injectable()
export class OptionalAuthGuard implements CanActivate {
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
    if (result.ok) req.user = result.user;
    return true;
  }
}
