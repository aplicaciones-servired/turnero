import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { ConfigService } from "@nestjs/config";
import type { ServiceDTO, ServiceTreeDTO } from "@turnero/shared";
import { Servicio } from "../models/servicio.model";
import { RelacionServicio } from "../models/relacion-servicio.model";
import { CreateServiceDto } from "./dto/create-service.dto";
import { UpdateServiceDto } from "./dto/update-service.dto";

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
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
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

    // La tabla legacy puede tener relaciones repetidas: se deduplican.
    const children = new Map<number, Set<number>>();
    const mainIds: number[] = [];
    for (const r of rels) {
      const parent = r.servicio;
      const child = r.subservicio;
      if (parent == null || child == null) continue;
      if (!children.has(parent)) {
        children.set(parent, new Set<number>());
        mainIds.push(parent);
      }
      // Las relaciones de un servicio consigo mismo (servicio suelto) no son hijos.
      if (child !== parent) children.get(parent)!.add(child);
    }

    const allIds = new Set<number>();
    for (const id of mainIds) {
      allIds.add(id);
      for (const c of children.get(id) ?? []) allIds.add(c);
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
      const kids = [...(children.get(id) ?? [])]
        .map((cid) => byId.get(cid))
        .filter((c): c is Servicio => Boolean(c))
        .map((c) => this.toDto(c))
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
      tree.push({ ...this.toDto(parent), children: kids });
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

  async create(dto: CreateServiceDto): Promise<ServiceDTO> {
    const nombre = dto.name.trim();
    const prefijo = dto.prefix.trim().toUpperCase();
    if (!nombre || !prefijo) {
      throw new BadRequestException("El nombre y el prefijo son obligatorios.");
    }

    const max = await this.servicioModel.max("IdServicio");
    const id = (Number(max) || 0) + 1;
    const activo = dto.active === false ? 1 : 0;

    let parentId: number | null = null;
    if (dto.parentId != null) {
      const parent = await this.servicioModel.findByPk(Number(dto.parentId));
      if (!parent || parent.Eliminado === 1) {
        throw new BadRequestException("El servicio padre no existe.");
      }
      parentId = Number(parent.IdServicio);
    }

    const created = await this.servicioModel.create({
      IdServicio: id,
      Servicio: nombre,
      Prefijo: prefijo,
      Cont_min: 0,
      Cont_max: 0,
      Secuencia: 0,
      Prioridad: dto.order ?? 0,
      Color: dto.color?.trim() || DEFAULT_COLOR,
      Eliminado: activo,
      IdSede: this.sedeId,
      EstadoNube: 0,
    } as any);

    // Sin relacion el servicio no aparece en el arbol del kiosco: los servicios
    // sueltos se relacionan consigo mismos y los hijos con su padre.
    const maxRel = await this.relacionModel.max("idrelacionservicio");
    await this.relacionModel.create({
      idrelacionservicio: (Number(maxRel) || 0) + 1,
      servicio: parentId ?? id,
      subservicio: id,
      IdSede: this.sedeId,
      Eliminado: 0,
      Asignado: 0,
      EstadoNube: 0,
    } as any);

    return this.toDto(created);
  }

  async update(id: string, dto: UpdateServiceDto): Promise<ServiceDTO> {
    const servicio = await this.findEntity(id);
    const patch: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      const nombre = dto.name.trim();
      if (!nombre) throw new BadRequestException("El nombre no puede quedar vacio.");
      patch.Servicio = nombre;
    }
    if (dto.prefix !== undefined) {
      const prefijo = dto.prefix.trim().toUpperCase();
      if (!prefijo) throw new BadRequestException("El prefijo no puede quedar vacio.");
      patch.Prefijo = prefijo;
    }
    if (dto.color !== undefined) patch.Color = dto.color.trim() || DEFAULT_COLOR;
    if (dto.order !== undefined) patch.Prioridad = dto.order;
    if (dto.active !== undefined) patch.Eliminado = dto.active ? 0 : 1;

    if (Object.keys(patch).length > 0) await servicio.update(patch);
    return this.toDto(servicio);
  }

  async remove(id: string): Promise<{ id: string; active: false }> {
    const servicio = await this.findEntity(id);
    const numericId = Number(servicio.IdServicio);
    await servicio.update({ Eliminado: 1 });
    await this.relacionModel.update(
      { Eliminado: 1 },
      { where: { servicio: numericId } }
    );
    await this.relacionModel.update(
      { Eliminado: 1 },
      { where: { subservicio: numericId } }
    );
    return { id: String(numericId), active: false };
  }
}
