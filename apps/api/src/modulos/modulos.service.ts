import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { Modulo } from "../models/modulo.model";

/**
 * Catalogo de cajas/modulos (tabla legacy `modulo`). Es la lista que el asesor
 * elige al ingresar para que la pantalla anuncie "pase a la caja X".
 */
@Injectable()
export class ModulosService {
  constructor(@InjectModel(Modulo) private readonly model: typeof Modulo) {}

  async list(): Promise<string[]> {
    const rows = await this.model.findAll({ order: [["IdModulo", "ASC"]] });
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of rows) {
      if (row.Eliminado === 1) continue;
      const value = (row.IdModulo ?? "").trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      out.push(value);
    }
    return out;
  }
}
