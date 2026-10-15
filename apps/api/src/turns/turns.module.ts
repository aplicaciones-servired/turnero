import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { Servicio } from "../models/servicio.model";
import { TablaTemporal } from "../models/tabla-temporal.model";
import { Auditoria } from "../models/auditoria.model";
import { Tv } from "../models/tv.model";
import { Usuario } from "../models/usuario.model";
import { RelacionUsUser } from "../models/relacionususer.model";
import { ConfigTurnosPerdidos } from "../models/configturnosperdidos.model";
import { Configtv } from "../models/configtv.model";
import { Persona } from "../models/persona.model";
import { SettingsModule } from "../settings/settings.module";
import { TurnsService } from "./turns.service";
import { TurnsController } from "./turns.controller";

@Module({
  imports: [
    SequelizeModule.forFeature([
      Servicio,
      TablaTemporal,
      Auditoria,
      Tv,
      Usuario,
      RelacionUsUser,
      ConfigTurnosPerdidos,
      Configtv,
      Persona,
    ]),
    SettingsModule,
  ],
  controllers: [TurnsController],
  providers: [TurnsService],
  exports: [TurnsService],
})
export class TurnsModule {}
