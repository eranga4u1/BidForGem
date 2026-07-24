import { Module } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { AuctionsModule } from "./auctions/auctions.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { AllExceptionsFilter } from "./common/all-exceptions.filter.js";
import { CommonModule } from "./common/common.module.js";
import { LoggingInterceptor } from "./common/logging.interceptor.js";
import { DatabaseModule } from "./database.module.js";
import { GemsModule } from "./gems/gems.module.js";
import { HealthController } from "./health/health.controller.js";
import { NotificationsModule } from "./notifications/notifications.module.js";

@Module({
  imports: [
    DatabaseModule,
    CommonModule,
    AuthModule,
    GemsModule,
    AuctionsModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
