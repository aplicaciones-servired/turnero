import { Controller, Get } from "@nestjs/common";
import { ModulosService } from "./modulos.service";

@Controller("modulos")
export class ModulosController {
  constructor(private readonly modulos: ModulosService) {}

  /** Catalogo de cajas/modulos para elegir al iniciar sesion. Publico. */
  @Get()
  list() {
    return this.modulos.list();
  }
}
