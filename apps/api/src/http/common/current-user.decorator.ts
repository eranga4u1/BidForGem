import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { PublicUser } from "@gem/types";
import type { AuthedRequest } from "./auth.guard.js";

/** Injects the authenticated user (or null under OptionalAuthGuard). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PublicUser | null => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    return req.user ?? null;
  },
);
