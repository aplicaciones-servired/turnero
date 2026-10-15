import { Global, Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module";
import { PrinterService } from "./printer.service";
import { PrinterController } from "./printer.controller";

@Global()
@Module({
  imports: [SettingsModule],
  controllers: [PrinterController],
  providers: [PrinterService],
  exports: [PrinterService],
})
export class PrinterModule {}
