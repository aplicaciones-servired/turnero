import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { SequelizeModule } from "@nestjs/sequelize";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { buildSequelizeOptions } from "./config/database.config";
import { AppController } from "./app.controller";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { ServicesModule } from "./services/services.module";
import { TurnsModule } from "./turns/turns.module";
import { SettingsModule } from "./settings/settings.module";
import { PrinterModule } from "./printer/printer.module";
import { ApkModule } from "./apk/apk.module";
import { RealtimeModule } from "./realtime/realtime.module";
import { VisualizerModule } from "./visualizer/visualizer.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env", "../../.env"] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    SequelizeModule.forRoot(buildSequelizeOptions()),
    PrinterModule,
    ApkModule,
    RealtimeModule,
    AuthModule,
    UsersModule,
    ServicesModule,
    TurnsModule,
    VisualizerModule,
    SettingsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
