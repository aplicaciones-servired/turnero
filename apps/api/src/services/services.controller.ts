import { Controller, Get, Param, Query } from "@nestjs/common";
import { ServicesService } from "./services.service";

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
}
