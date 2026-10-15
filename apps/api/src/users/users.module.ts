import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { Usuario } from "../models/usuario.model";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";

@Module({
  imports: [SequelizeModule.forFeature([Usuario])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
