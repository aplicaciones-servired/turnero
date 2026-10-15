import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { Setting } from "../models/setting.model";
import { Configtv } from "../models/configtv.model";
import { Datosempresa } from "../models/datosempresa.model";
import { SettingsService } from "./settings.service";
import { SettingsController } from "./settings.controller";

@Module({
  imports: [SequelizeModule.forFeature([Setting, Configtv, Datosempresa])],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
