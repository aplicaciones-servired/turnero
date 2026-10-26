import { Module } from "@nestjs/common";
import { SequelizeModule } from "@nestjs/sequelize";
import { RelacionUsUser } from "../models/relacionususer.model";
import { Usuario } from "../models/usuario.model";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";

@Module({
  imports: [SequelizeModule.forFeature([Usuario, RelacionUsUser])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
