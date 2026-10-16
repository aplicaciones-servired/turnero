import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ServicesService } from "./services.service";
import { CreateServiceDto } from "./dto/create-service.dto";
import { UpdateServiceDto } from "./dto/update-service.dto";

@Controller("services")
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  /** Publico: la pantalla de clientes (kiosco) lista los servicios activos. */
  @Get()
  findAll(@Query("active") active?: string) {
    return this.services.findTree(active !== "false");
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    const entity = await this.services.findEntity(id);
    return {
      id: String(entity.IdServicio),
      name: entity.Servicio ?? `Servicio ${entity.IdServicio}`,
      prefix: entity.Prefijo ?? "",
      active: entity.Eliminado !== 1,
      order: entity.Prioridad ?? 0,
      color: entity.Color && entity.Color.trim() ? entity.Color : "#2563eb",
      printHeader: null,
      printFooter: null,
    };
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post()
  create(@Body() dto: CreateServiceDto) {
    return this.services.create(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateServiceDto) {
    return this.services.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.services.remove(id);
  }
}
