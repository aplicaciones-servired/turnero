import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { Modulo } from "../models/modulo.model";
import { ModulosService } from "./modulos.service";
import { ModulosController } from "./modulos.controller";

@Module({
  imports: [SequelizeModule.forFeature([Modulo])],
  controllers: [ModulosController],
  providers: [ModulosService],
})
export class ModulosModule {}
