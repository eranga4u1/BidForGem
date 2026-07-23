import { Global, Module } from "@nestjs/common";
import { AuthGuard, OptionalAuthGuard } from "./auth.guard.js";

/** Provides the auth guards so controllers can @UseGuards them. */
@Global()
@Module({
  providers: [AuthGuard, OptionalAuthGuard],
  exports: [AuthGuard, OptionalAuthGuard],
})
export class CommonModule {}
