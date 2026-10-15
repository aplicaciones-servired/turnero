import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { Servicio } from "../models/servicio.model";
import { RelacionServicio } from "../models/relacion-servicio.model";
import { ServicesService } from "./services.service";
import { ServicesController } from "./services.controller";

@Module({
  imports: [SequelizeModule.forFeature([Servicio, RelacionServicio])],
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
