import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { ConfigService } from "@nestjs/config";
import type { ServiceDTO, ServiceTreeDTO } from "@turnero/shared";
import { Servicio } from "../models/servicio.model";
import { RelacionServicio } from "../models/relacion-servicio.model";

const DEFAULT_COLOR = "#2563eb";

@Injectable()
export class ServicesService {
  constructor(
    @InjectModel(Servicio) private readonly servicioModel: typeof Servicio,
    @InjectModel(RelacionServicio)
    private readonly relacionModel: typeof RelacionServicio,
    private readonly config: ConfigService
  ) {}

  private get sedeId(): number | null {
    const raw = this.config.get<string>("SEDE_ID");
    return raw ? Number(raw) : null;
  }

  private toDto(s: Servicio): ServiceDTO {
    return {
      id: String(s.IdServicio),
      name: s.Servicio ?? `Servicio ${s.IdServicio}`,
      prefix: s.Prefijo ?? "",
      active: s.Eliminado !== 1,
      order: s.Prioridad ?? 0,
      color: s.Color && s.Color.trim() ? s.Color : DEFAULT_COLOR,
      printHeader: null,
      printFooter: null,
    };
  }

  async findTree(onlyActive = true): Promise<ServiceTreeDTO[]> {
    const whereRel: Record<string, unknown> = { Eliminado: 0 };
    if (this.sedeId !== null) whereRel.IdSede = this.sedeId;

    const rels = await this.relacionModel.findAll({ where: whereRel });

    const childMap = new Map<number, number[]>();
    const mainIds: number[] = [];
    for (const r of rels) {
      const parent = r.servicio;
      const child = r.subservicio;
      if (parent == null || child == null) continue;
      if (!childMap.has(parent)) {
        childMap.set(parent, []);
        mainIds.push(parent);
      }
      childMap.get(parent)!.push(child);
    }

    const allIds = new Set<number>();
    for (const id of mainIds) {
      allIds.add(id);
      for (const c of childMap.get(id) ?? []) allIds.add(c);
    }

    const servicios = await this.servicioModel.findAll({
      where: onlyActive
        ? { IdServicio: [...allIds], Eliminado: 0 }
        : { IdServicio: [...allIds] },
    });
    const byId = new Map(servicios.map((s) => [s.IdServicio, s]));

    const tree: ServiceTreeDTO[] = [];
    for (const id of mainIds) {
      const parent = byId.get(id);
      if (!parent) continue;
      const children = (childMap.get(id) ?? [])
        .map((cid) => byId.get(cid))
        .filter((c): c is Servicio => Boolean(c))
        .map((c) => this.toDto(c));
      tree.push({ ...this.toDto(parent), children });
    }
    return tree.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  }

  async findAll(onlyActive = true): Promise<ServiceDTO[]> {
    return (await this.findTree(onlyActive)).map(({ children: _children, ...s }) => s);
  }

  async findEntity(id: string): Promise<Servicio> {
    const servicio = await this.servicioModel.findByPk(Number(id));
    if (!servicio) throw new NotFoundException("Servicio no encontrado");
    return servicio;
  }
}
