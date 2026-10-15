import { Module } from "@nestjs/common";
import { ApkService } from "./apk.service";
import { ApkController } from "./apk.controller";

@Module({
  controllers: [ApkController],
  providers: [ApkService],
  exports: [ApkService],
})
export class ApkModule {}
