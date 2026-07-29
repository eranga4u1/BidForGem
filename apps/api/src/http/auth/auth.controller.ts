import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import type { PublicUser } from "@gem/types";
import type { AuthService, RequestContext } from "../../auth/auth-service.js";
import { AuthGuard } from "../common/auth.guard.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { unwrap } from "../common/respond.js";
import { AUTH_SERVICE } from "../tokens.js";

function ctxFrom(req: Request): RequestContext {
  return { ip: req.ip ?? null, userAgent: req.headers["user-agent"] ?? null };
}

@Controller("auth")
export class AuthController {
  constructor(@Inject(AUTH_SERVICE) private readonly auth: AuthService) {}

  @Post("register")
  async register(@Body() body: unknown, @Req() req: Request) {
    return unwrap(await this.auth.register(body, ctxFrom(req)));
  }

  @Post("login")
  async login(@Body() body: unknown, @Req() req: Request) {
    return unwrap(await this.auth.login(body, ctxFrom(req)));
  }

  @Post("refresh")
  async refresh(@Body() body: unknown, @Req() req: Request) {
    return unwrap(await this.auth.refresh(body, ctxFrom(req)));
  }

  @Post("logout")
  @HttpCode(200)
  async logout(@Body() body: unknown) {
    return this.auth.logout(body);
  }

  /**
   * Always returns the same generic success for a well-formed email, whether or
   * not an account exists (no enumeration). Malformed input is a 400.
   */
  @Post("forgot-password")
  @HttpCode(200)
  async forgotPassword(@Body() body: unknown, @Req() req: Request) {
    return unwrap(await this.auth.forgotPassword(body, ctxFrom(req)));
  }

  @Post("reset-password")
  @HttpCode(200)
  async resetPassword(@Body() body: unknown) {
    return unwrap(await this.auth.resetPassword(body));
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: PublicUser) {
    return { ok: true as const, user };
  }

  @Patch("me")
  @UseGuards(AuthGuard)
  async updateMe(@CurrentUser() user: PublicUser, @Body() body: unknown) {
    return unwrap(await this.auth.updateProfile(user.id, body));
  }
}
