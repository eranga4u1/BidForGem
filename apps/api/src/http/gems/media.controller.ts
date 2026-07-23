import { Body, Controller, Delete, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import type { PublicUser } from "@gem/types";
import type { MediaService } from "../../gems/media-service.js";
import { AuthGuard, OptionalAuthGuard } from "../common/auth.guard.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { unwrap } from "../common/respond.js";
import { MEDIA_SERVICE } from "../tokens.js";

@Controller("gems/:gemId/media")
export class MediaController {
  constructor(@Inject(MEDIA_SERVICE) private readonly media: MediaService) {}

  @Post("upload-url")
  @UseGuards(AuthGuard)
  async requestUpload(
    @CurrentUser() user: PublicUser,
    @Param("gemId") gemId: string,
    @Body() body: unknown,
  ) {
    return unwrap(await this.media.requestUpload(user.id, gemId, body));
  }

  @Post(":mediaId/complete")
  @UseGuards(AuthGuard)
  async complete(
    @CurrentUser() user: PublicUser,
    @Param("gemId") gemId: string,
    @Param("mediaId") mediaId: string,
  ) {
    return unwrap(await this.media.completeUpload(user.id, gemId, mediaId));
  }

  @Delete(":mediaId")
  @UseGuards(AuthGuard)
  async remove(
    @CurrentUser() user: PublicUser,
    @Param("gemId") gemId: string,
    @Param("mediaId") mediaId: string,
  ) {
    return unwrap(await this.media.deleteMedia(user.id, gemId, mediaId));
  }

  @Get(":mediaId/url")
  @UseGuards(OptionalAuthGuard)
  async readUrl(
    @CurrentUser() user: PublicUser | null,
    @Param("gemId") gemId: string,
    @Param("mediaId") mediaId: string,
  ) {
    return unwrap(await this.media.getReadUrl(user?.id ?? null, gemId, mediaId));
  }
}
