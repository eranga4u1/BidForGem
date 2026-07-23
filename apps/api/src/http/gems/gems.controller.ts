import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { PublicUser } from "@gem/types";
import type { GemsService } from "../../gems/gems-service.js";
import { AuthGuard, OptionalAuthGuard } from "../common/auth.guard.js";
import { CurrentUser } from "../common/current-user.decorator.js";
import { unwrap } from "../common/respond.js";
import { GEMS_SERVICE } from "../tokens.js";

@Controller("gems")
export class GemsController {
  constructor(@Inject(GEMS_SERVICE) private readonly gems: GemsService) {}

  @Post()
  @UseGuards(AuthGuard)
  async create(@CurrentUser() user: PublicUser, @Body() body: unknown) {
    return unwrap(await this.gems.create(user.id, body));
  }

  @Get()
  @UseGuards(OptionalAuthGuard)
  async list(@CurrentUser() user: PublicUser | null, @Query() query: unknown) {
    return unwrap(await this.gems.list(user?.id ?? null, query));
  }

  @Get(":id")
  @UseGuards(OptionalAuthGuard)
  async get(@CurrentUser() user: PublicUser | null, @Param("id") id: string) {
    return unwrap(await this.gems.get(user?.id ?? null, id));
  }

  @Patch(":id")
  @UseGuards(AuthGuard)
  async update(@CurrentUser() user: PublicUser, @Param("id") id: string, @Body() body: unknown) {
    return unwrap(await this.gems.update(user.id, id, body));
  }

  @Delete(":id")
  @UseGuards(AuthGuard)
  async remove(@CurrentUser() user: PublicUser, @Param("id") id: string) {
    return unwrap(await this.gems.remove(user.id, id));
  }

  @Post(":id/publish")
  @UseGuards(AuthGuard)
  async publish(@CurrentUser() user: PublicUser, @Param("id") id: string) {
    return unwrap(await this.gems.publish(user.id, id));
  }
}
