import { Body, Controller, Inject, Patch, UseGuards } from "@nestjs/common";
import type { PublicUser } from "@gem/types";
import type { SettingsService } from "../../settings/settings-service.js";
import { AdminGuard } from "../common/admin.guard.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { unwrap } from "../common/respond.js";
import { SETTINGS_SERVICE } from "../tokens.js";

@Controller("admin/settings")
@UseGuards(AdminGuard)
export class AdminController {
  constructor(@Inject(SETTINGS_SERVICE) private readonly settings: SettingsService) {}

  @Patch("posting_fee")
  async updatePostingFee(@CurrentUser() user: PublicUser, @Body() body: unknown) {
    return unwrap(await this.settings.updatePostingFee(body, user.id));
  }
}
