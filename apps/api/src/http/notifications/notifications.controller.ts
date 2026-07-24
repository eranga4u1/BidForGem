import { Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { PublicUser } from "@gem/types";
import type { NotificationsService } from "../../notifications/notifications-service.js";
import { AuthGuard } from "../common/auth.guard.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { unwrap } from "../common/respond.js";
import { NOTIFICATIONS_SERVICE } from "../tokens.js";

@Controller("notifications")
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(
    @Inject(NOTIFICATIONS_SERVICE) private readonly notifications: NotificationsService,
  ) {}

  @Get()
  async list(@CurrentUser() user: PublicUser, @Query() query: unknown) {
    return unwrap(await this.notifications.list(user.id, query));
  }

  @Post(":id/read")
  @HttpCode(200)
  async read(@CurrentUser() user: PublicUser, @Param("id") id: string) {
    return unwrap(await this.notifications.markRead(user.id, id));
  }

  @Post("read-all")
  @HttpCode(200)
  async readAll(@CurrentUser() user: PublicUser) {
    return this.notifications.markAllRead(user.id);
  }
}
