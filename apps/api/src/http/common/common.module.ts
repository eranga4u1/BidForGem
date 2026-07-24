import { Global, Module } from "@nestjs/common";
import { AdminGuard } from "./admin.guard.js";
import { AuthGuard, OptionalAuthGuard } from "./auth.guard.js";

/** Provides the auth guards so controllers can @UseGuards them. */
@Global()
@Module({
  providers: [AuthGuard, OptionalAuthGuard, AdminGuard],
  exports: [AuthGuard, OptionalAuthGuard, AdminGuard],
})
export class CommonModule {}
