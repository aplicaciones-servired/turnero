import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/sequelize";
import { ConfigService } from "@nestjs/config";
import { Op, Sequelize, WhereOptions } from "sequelize";
import type {
  AuthUser,
  CallTurnPayload,
  ServiceDTO,
  SnapshotDTO,
  TurnDTO,
  TurnStatus,
} from "@turnero/shared";
import { buildAnnouncement } from "@turnero/shared";
import { Servicio } from "../models/servicio.model";
import { TablaTemporal } from "../models/tabla-temporal.model";
import { Auditoria } from "../models/auditoria.model";
import { Tv } from "../models/tv.model";
import { Usuario } from "../models/usuario.model";
import { RelacionUsUser } from "../models/relacionususer.model";
import { ConfigTurnosPerdidos } from "../models/configturnosperdidos.model";
import { Configtv } from "../models/configtv.model";
import { Persona } from "../models/persona.model";
import { SettingsService } from "../settings/settings.service";
import { PrinterService } from "../printer/printer.service";
import { TurnsGateway } from "../realtime/turns.gateway";

export interface FinishTurnInput {
  CedulaCliente?: string;
  IdEncuesta?: number;
  IdPersona?: number;
}

/** Cuantos llamados recientes se conservan por pantalla en la tabla `tv`. */
const TV_KEEP = 30;

export interface TransferTurnInput {
  IdTemporal: number;
  IdAuditoria: number;
  ServicioAtransferir: number;
  Turno: string;
  IdPersona?: number;
  IdEncuesta?: number;
  idusuarioTransferencia?: number;
  CedulaCliente?: string;
  NombreCliente?: string;
}

@Injectable()
export class TurnsService {
  private readonly estadoEspera: string;
  private readonly estadoLlamando: string;
  private readonly estadoAplazado = "Aplazado";
  private readonly estadoTerminado: string;
  private readonly estadoAusente = "AUSENTE";
  private readonly estadoCancelado: string;
  private readonly sedeId: number;
  private readonly empId: number;

  constructor(
    @InjectModel(Servicio) private readonly servicioModel: typeof Servicio,
    @InjectModel(TablaTemporal) private readonly tablaModel: typeof TablaTemporal,
    @InjectModel(Auditoria) private readonly auditoriaModel: typeof Auditoria,
    @InjectModel(Tv) private readonly tvModel: typeof Tv,
    @InjectModel(Usuario) private readonly usuarioModel: typeof Usuario,
    @InjectModel(RelacionUsUser) private readonly relacionModel: typeof RelacionUsUser,
    @InjectModel(ConfigTurnosPerdidos)
    private readonly perdidosModel: typeof ConfigTurnosPerdidos,
    @InjectModel(Configtv) private readonly configModel: typeof Configtv,
    @InjectModel(Persona) private readonly personaModel: typeof Persona,
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
    private readonly printer: PrinterService,
    private readonly gateway: TurnsGateway
  ) {
    this.estadoEspera = this.config.get<string>("ESTADO_ESPERA") ?? "NORMAL";
    this.estadoLlamando = this.config.get<string>("ESTADO_LLAMANDO") ?? "Llamando";
    this.estadoTerminado = this.config.get<string>("ESTADO_TERMINADO") ?? "TERMINADO";
    this.estadoCancelado = this.config.get<string>("ESTADO_CANCELADO") ?? "CANCELADO";
    this.sedeId = Number(this.config.get<string>("SEDE_ID") ?? 12);
    this.empId = Number(this.config.get<string>("EMP_ID") ?? 12);
  }

  // ─────────────────────────────────────────────────────────────
  // KIOSCO
  // ─────────────────────────────────────────────────────────────

  /** Genera un turno (bloquea el servicio), lo guarda en tablatemporal/auditoria y lo imprime. */
  async generate(
    serviceId: string
  ): Promise<{ turn: TurnDTO; printed: boolean; ticket?: string }> {
    const idServicio = Number(serviceId);
    const transaction = await this.sequelize.transaction();
    let tablaId!: number;
    try {
      const servicio = await this.servicioModel.findByPk(idServicio, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!servicio) throw new NotFoundException("Servicio no encontrado");
      if (servicio.Eliminado === 1) {
        throw new BadRequestException("El servicio no esta disponible");
      }

      const min = servicio.Cont_min ?? 0;
      const max = servicio.Cont_max ?? 999;
      let next = (servicio.Secuencia ?? 0) + 1;
      if (next > max) next = min;
      servicio.Secuencia = next;
      await servicio.save({ transaction });

      const code = this.buildCode(servicio.Prefijo, next);
      const now = new Date();

      const auditoriaId =
        Number((await this.auditoriaModel.max("IdAuditoria", { transaction })) ?? 0) + 1;
      await this.auditoriaModel.create(
        {
          IdAuditoria: auditoriaId,
          IdServicio: idServicio,
          IdUsuario: null,
          Turno: code,
          IdPersona: 0,
          IdEncuesta: 0,
          Estado: this.estadoEspera,
          FechaLlegada: now,
          FechaLlamado: null,
          Fechasalio: null,
          NumeroLlamados: 0,
          Observacion: "",
          ObservacionAsesor: "",
          EstadoNube: null,
          idrelacionservicio: 0,
          ObservacionRetraso: "",
          LlamadoEspecifico: 0,
          CedulaCliente: "",
          NombreCliente: "",
          TipoDocumento: "",
          TipoPersona: "",
          TipoPoblacion: "",
          IdTurnoAgendado: 0,
          Eliminado: 0,
          IdSede: this.sedeId,
          emp_id: this.empId,
        },
        { transaction }
      );

      tablaId =
        Number((await this.tablaModel.max("IdTablaTemporal", { transaction })) ?? 0) + 1;
      await this.tablaModel.create(
        {
          IdTablaTemporal: tablaId,
          IdServicio: idServicio,
          Turno: code,
          Estado: this.estadoEspera,
          Dato1: null,
          Dato2: null,
          LlamadoPor: "ASESOR",
          Prioridad: servicio.Prioridad ?? 3,
          FechaLlegada: now,
          IdAuditoria: auditoriaId,
          Observacion: null,
          FechaLlamado: null,
          UltimoLlamado: null,
          EstadoLlamado: null,
          transferenciaUsuario: null,
          Dato3: null,
          Dato4: null,
          IdTurnoAgendado: null,
          IdSede: this.sedeId,
          emp_id: this.empId,
        },
        { transaction }
      );

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    const tabla = await this.tablaModel.findByPk(tablaId);
    const dto = await this.toDto(tabla!);
    this.gateway.emitTurnCreated(dto);
    await this.broadcastSnapshot();

    const settings = await this.settings.get();
    const serviceDto = await this.serviceDto(Number(serviceId));
    const { printed, ticket } = await this.printer.printTurn(dto, serviceDto, settings);

    return { turn: dto, printed, ticket };
  }

  async snapshot(): Promise<SnapshotDTO> {
    const [nowServing, waiting] = await Promise.all([
      this.tablaModel.findAll({
        where: { Estado: this.estadoLlamando },
        order: [["FechaLlamado", "DESC"]],
        limit: 10,
      }),
      this.tablaModel.findAll({
        where: { Estado: this.estadoEspera },
        order: [["Prioridad", "ASC"], ["FechaLlegada", "ASC"]],
        limit: 30,
      }),
    ]);
    return {
      nowServing: await this.toDtos(nowServing),
      waiting: await this.toDtos(waiting),
    };
  }

  async listAll(status?: string, serviceId?: string): Promise<TurnDTO[]> {
    const where: WhereOptions = {};
    if (serviceId) where.IdServicio = Number(serviceId);
    if (status) where.Estado = this.statusToEstado(status);
    const rows = await this.auditoriaModel.findAll({
      where,
      order: [["IdAuditoria", "DESC"]],
      limit: 200,
    });
    return this.auditoriaToDtos(rows);
  }

  // ─────────────────────────────────────────────────────────────
  // LLAMADOS (Mando)
  // ─────────────────────────────────────────────────────────────

  /** Llamar: toma el siguiente turno del usuario (Aplazados -> prioridad). */
  async call(user: AuthUser): Promise<CallTurnPayload> {
    const userId = this.userId(user);
    const serviceIds = await this.allowedServiceIds(user);

    const min = await this.minutosPerdidos();
    const now = new Date();

    let row = await this.pickAplazado(serviceIds, userId, min, now);
    if (!row) row = await this.pickNormal(serviceIds, userId);
    if (!row) throw new NotFoundException("No hay turnos en la cola");

    return this.marcarLlamado(row, user);
  }

  /** Llamar un turno especifico (por IdTablaTemporal). */
  async callById(id: string, user: AuthUser): Promise<CallTurnPayload> {
    const row = await this.findTabla(id);
    return this.marcarLlamado(row, user);
  }

  /** Llamar individual: siguiente turno de un servicio concreto. */
  async callService(serviceId: number, user: AuthUser): Promise<CallTurnPayload> {
    const userId = this.userId(user);
    const serviceIds = await this.allowedServiceIds(user);
    if (serviceIds !== null && !serviceIds.includes(serviceId)) {
      throw new BadRequestException("El usuario no atiende este servicio");
    }
    const min = await this.minutosPerdidos();
    const now = new Date();

    let row = await this.pickAplazado([serviceId], userId, min, now);
    if (!row) row = await this.pickNormal([serviceId], userId);
    if (!row) throw new NotFoundException("No hay turnos en la cola");

    return this.marcarLlamado(row, user);
  }

  /** Repite el llamado en pantalla (re-inserta en tv). */
  async repeat(id: string, user: AuthUser): Promise<CallTurnPayload> {
    const row = await this.findTabla(id);
    return this.marcarLlamado(row, user, true);
  }

  /** LlamarTurnoEspecifico: envia un turno concreto a todas las pantallas. */
  async callSpecific(turno: string, modulo: string): Promise<{ ok: true }> {
    const visualizadores = await this.allVisualizadores();
    let next = Number((await this.tvModel.max("IdTv")) ?? 0) + 1;
    for (const v of visualizadores) {
      const id = next++;
      await this.tvModel.create(this.tvRow(id, modulo, turno, "", v));
      await this.pruneTv(v);
    }
    const now = new Date().toISOString();
    const synthetic: TurnDTO = {
      id: `specific-${Date.now()}`,
      number: Number(turno.replace(/[^0-9]/g, "")) || 0,
      code: turno,
      status: "called",
      serviceId: "",
      counterId: null,
      counterName: modulo,
      createdAt: now,
      calledAt: now,
      finishedAt: null,
    };
    this.gateway.emitTurnCalled({ turn: synthetic, counterName: modulo, announcement: turno });
    return { ok: true };
  }

  private async marcarLlamado(
    row: TablaTemporal,
    user: AuthUser,
    esRepeticion = false
  ): Promise<CallTurnPayload> {
    const now = new Date();
    const userId = this.userId(user);
    const servicio = row.IdServicio
      ? await this.servicioModel.findByPk(row.IdServicio)
      : null;

    if (!esRepeticion) {
      row.Estado = this.estadoLlamando;
      row.FechaLlamado = now;
      row.UltimoLlamado = (row.UltimoLlamado ?? 0) + 1;
      row.LlamadoPor = (user.counterName ?? user.displayName ?? "ASESOR").slice(0, 20);
      await row.save();

      if (row.IdAuditoria) {
        await this.auditoriaModel.update(
          { FechaLlamado: now, IdUsuario: userId, EstadoNube: 0 },
          { where: { IdAuditoria: row.IdAuditoria } }
        );
      }
      if (userId) {
        await this.usuarioModel.update(
          { Estado: "LLAMANDO", EstadoNube: 0 },
          { where: { IdUsuario: userId } }
        );
      }
    } else {
      row.UltimoLlamado = (row.UltimoLlamado ?? 0) + 1;
      await row.save();
    }

    const counterName = row.LlamadoPor ?? user.displayName ?? "";
    await this.pushTv(servicio, row, counterName);

    const dto = await this.toDto(row);
    const settings = await this.settings.get();
    const announcement = buildAnnouncement(dto.code, counterName, settings.announcePrefix);
    const payload: CallTurnPayload = { turn: dto, counterName, announcement };
    this.gateway.emitTurnCalled(payload);
    await this.broadcastSnapshot();
    return payload;
  }

  /** TerminarTurno: auditoria TERMINADO + persona por cedula + borra tablatemporal. */
  async finish(id: string, user: AuthUser, input: FinishTurnInput): Promise<TurnDTO> {
    const tabla = await this.findTabla(id);
    const now = new Date();
    const userId = this.userId(user);

    let idPersona = input.IdPersona ?? 0;
    let nombrePersona = "0";
    const cedula = (input.CedulaCliente ?? "").trim();
    if (cedula) {
      const persona = await this.personaModel.findOne({ where: { Cedula: cedula } });
      if (persona) {
        idPersona = persona.IdPersona;
        nombrePersona = persona.NombreCompleto ?? "0";
      }
    }

    if (tabla.IdAuditoria) {
      await this.auditoriaModel.update(
        {
          Estado: this.estadoTerminado,
          Fechasalio: now,
          IdPersona: idPersona,
          CedulaCliente: cedula,
          NombreCliente: nombrePersona,
          IdEncuesta: input.IdEncuesta ?? 0,
          IdUsuario: userId,
          EstadoNube: 0,
        },
        { where: { IdAuditoria: tabla.IdAuditoria } }
      );
    }

    const dto = await this.toDto(tabla);
    await tabla.destroy();
    if (userId) {
      await this.usuarioModel.update(
        { Estado: "DISPONIBLE", EstadoNube: 0 },
        { where: { IdUsuario: userId } }
      );
    }
    this.gateway.emitTurnFinished(dto);
    return dto;
  }

  /** EliminarTurno: el cliente no se presento (AUSENTE). */
  async absent(id: string, user: AuthUser): Promise<TurnDTO> {
    const tabla = await this.findTabla(id);
    const now = new Date();
    const userId = this.userId(user);

    if (tabla.IdAuditoria) {
      await this.auditoriaModel.update(
        {
          Estado: this.estadoAusente,
          EstadoNube: 0,
          NumeroLlamados: tabla.UltimoLlamado ?? 0,
          Observacion: "cumplio Limite de Todos los llamados",
          Fechasalio: now,
        },
        { where: { IdAuditoria: tabla.IdAuditoria } }
      );
    }
    const dto = await this.toDto(tabla);
    await tabla.destroy();
    if (userId) {
      await this.usuarioModel.update(
        { Estado: "DISPONIBLE", EstadoNube: 0 },
        { where: { IdUsuario: userId } }
      );
    }
    this.gateway.emitTurnSkipped(dto);
    await this.broadcastSnapshot();
    return dto;
  }

  /** Aplazar (dejar para despues). */
  async defer(id: string, user: AuthUser): Promise<TurnDTO> {
    const tabla = await this.findTabla(id);
    tabla.Estado = this.estadoAplazado;
    await tabla.save();
    const userId = this.userId(user);
    if (userId) {
      await this.usuarioModel.update(
        { Estado: "DISPONIBLE", EstadoNube: 0 },
        { where: { IdUsuario: userId } }
      );
    }
    const dto = await this.toDto(tabla);
    await this.broadcastSnapshot();
    return dto;
  }

  /** Transferir turno a otro servicio. */
  async transfer(input: TransferTurnInput, user: AuthUser): Promise<{ ok: true }> {
    const now = new Date();
    const userId = this.userId(user);
    const transaction = await this.sequelize.transaction();
    try {
      if (input.IdAuditoria) {
        await this.auditoriaModel.update(
          {
            Estado: this.estadoTerminado,
            Observacion: "TRANSFERIDO",
            Fechasalio: now,
            EstadoNube: 0,
          },
          { where: { IdAuditoria: input.IdAuditoria }, transaction }
        );
      }
      await this.tablaModel.destroy({
        where: { IdTablaTemporal: input.IdTemporal },
        transaction,
      });

      const audId = Number((await this.auditoriaModel.max("IdAuditoria", { transaction })) ?? 0) + 1;
      await this.auditoriaModel.create(
        {
          IdAuditoria: audId,
          IdServicio: input.ServicioAtransferir,
          Turno: input.Turno,
          Estado: this.estadoEspera,
          FechaLlegada: now,
          EstadoNube: 0,
          Eliminado: 0,
          IdSede: this.sedeId,
          emp_id: this.empId,
        },
        { transaction }
      );

      const tablaId = Number((await this.tablaModel.max("IdTablaTemporal", { transaction })) ?? 0) + 1;
      const servicio = await this.servicioModel.findByPk(input.ServicioAtransferir, {
        transaction,
      });
      await this.tablaModel.create(
        {
          IdTablaTemporal: tablaId,
          IdServicio: input.ServicioAtransferir,
          Turno: input.Turno,
          Estado: this.estadoEspera,
          LlamadoPor: "ASESOR",
          Prioridad: 1,
          FechaLlegada: now,
          IdAuditoria: audId,
          EstadoLlamado: 0,
          transferenciaUsuario: input.idusuarioTransferencia ?? null,
          Dato3: input.CedulaCliente ?? null,
          Dato4: input.NombreCliente ?? null,
          IdSede: this.sedeId,
          emp_id: this.empId,
        },
        { transaction }
      );
      void servicio;
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    if (userId) {
      await this.usuarioModel.update(
        { Estado: "DISPONIBLE", EstadoNube: 0 },
        { where: { IdUsuario: userId } }
      );
    }
    await this.broadcastSnapshot();
    return { ok: true };
  }

  /** Guardar observacion del asesor. */
  async saveAdvisorNote(auditoriaId: number, observacion: string): Promise<{ ok: true }> {
    await this.auditoriaModel.update(
      { ObservacionAsesor: observacion, EstadoNube: 0 },
      { where: { IdAuditoria: auditoriaId } }
    );
    return { ok: true };
  }

  /** Observacion obligatoria por retraso. */
  async saveDelayNote(auditoriaId: number, observacion: string): Promise<{ ok: true }> {
    await this.auditoriaModel.update(
      { ObservacionRetraso: observacion, EstadoNube: 0 },
      { where: { IdAuditoria: auditoriaId } }
    );
    return { ok: true };
  }

  /** Cambiar el estado del usuario (DISPONIBLE/LLAMANDO/ATENDIENDO/CAJA CERRADA). */
  async setUserState(userId: number, estado: string): Promise<{ ok: true }> {
    await this.usuarioModel.update(
      { Estado: estado, EstadoNube: 0 },
      { where: { IdUsuario: userId } }
    );
    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────────
  // Consultas de la cola por usuario (contadores)
  // ─────────────────────────────────────────────────────────────

  async countByUser(user: AuthUser) {
    const userId = this.userId(user);
    const serviceIds = await this.allowedServiceIds(user);
    const where: WhereOptions = {
      Estado: { [Op.in]: [this.estadoEspera, this.estadoAplazado] },
    };
    if (serviceIds !== null) where.IdServicio = { [Op.in]: serviceIds };
    const rows = await this.tablaModel.findAll({ where });
    const porServicio = new Map<number, { servicio: string; cantidad: number }>();
    for (const r of rows) {
      if (r.IdServicio == null) continue;
      const actual = porServicio.get(r.IdServicio) ?? { servicio: "", cantidad: 0 };
      actual.cantidad += 1;
      porServicio.set(r.IdServicio, actual);
    }
    const ids = [...porServicio.keys()];
    const servicios = ids.length
      ? await this.servicioModel.findAll({ where: { IdServicio: { [Op.in]: ids } } })
      : [];
    for (const s of servicios) {
      const item = porServicio.get(s.IdServicio);
      if (item) item.servicio = s.Servicio ?? "";
    }
    void userId;
    const respuesta = [...porServicio.values()];
    const contar = respuesta.reduce((a, b) => a + b.cantidad, 0);
    return { respuesta, contar };
  }

  // ─────────────────────────────────────────────────────────────
  // UTILIDADES
  // ─────────────────────────────────────────────────────────────

  private async pickAplazado(
    serviceIds: number[] | null,
    userId: number | null,
    min: number,
    now: Date
  ): Promise<TablaTemporal | null> {
    const limite = new Date(now.getTime() - min * 60_000);
    const where: WhereOptions = {
      Estado: this.estadoAplazado,
      [Op.and]: [
        { [Op.or]: [{ FechaLlamado: { [Op.lt]: limite } }, { FechaLlamado: null }] },
      ],
    };
    this.applyServiceFilter(where, serviceIds, userId);
    return this.tablaModel.findOne({
      where,
      order: [["UltimoLlamado", "ASC"], ["IdTablaTemporal", "ASC"]],
    });
  }

  private async pickNormal(
    serviceIds: number[] | null,
    userId: number | null
  ): Promise<TablaTemporal | null> {
    const where: WhereOptions = {
      Estado: this.estadoEspera,
      [Op.and]: [{ [Op.or]: [{ EstadoLlamado: null }, { EstadoLlamado: 0 }] }],
    };
    this.applyServiceFilter(where, serviceIds, userId);
    return this.tablaModel.findOne({
      where,
      order: [["Prioridad", "ASC"], ["IdTablaTemporal", "ASC"]],
    });
  }

  private applyServiceFilter(
    where: WhereOptions,
    serviceIds: number[] | null,
    userId: number | null
  ): void {
    if (serviceIds === null) return;
    const or: unknown[] = [];
    if (serviceIds.length) or.push({ IdServicio: { [Op.in]: serviceIds } });
    if (userId) or.push({ transferenciaUsuario: userId });
    where[Op.and] = [
      ...((where[Op.and] as unknown[]) ?? []),
      or.length ? { [Op.or]: or } : { IdServicio: -1 },
    ];
  }

  private async allowedServiceIds(user: AuthUser): Promise<number[] | null> {
    if (user.role === "admin") return null;
    const userId = this.userId(user);
    if (!userId) return [];
    const rows = await this.relacionModel.findAll({
      where: { IdUsuario: userId, Eliminado: 0 },
    });
    return rows
      .map((r) => r.IdServicio)
      .filter((v): v is number => v != null);
  }

  private async minutosPerdidos(): Promise<number> {
    const row = await this.perdidosModel.findOne();
    return row?.TiempoEspera ?? 0;
  }

  private async allVisualizadores(): Promise<number[]> {
    const rows = await this.configModel.findAll({
      attributes: ["estado"],
      group: ["estado"],
    });
    const ids = rows
      .map((r) => r.estado)
      .filter((v): v is number => v != null);
    return ids.length ? ids : [1];
  }

  /** Inserta el llamado en la tabla `tv` para la pantalla objetivo del servicio. */
  private async pushTv(
    servicio: Servicio | null,
    row: TablaTemporal,
    modulo: string
  ): Promise<void> {
    const objetivo = (servicio?.LlamadoTv ?? "").trim().toUpperCase();
    const targets =
      !objetivo || objetivo === "TODOS" ? await this.allVisualizadores() : [Number(objetivo) || 1];

    let next = Number((await this.tvModel.max("IdTv")) ?? 0) + 1;
    for (const v of targets) {
      const id = next++;
      await this.tvModel.create(
        this.tvRow(id, modulo, row.Turno ?? "", servicio?.Servicio ?? "", v)
      );
      await this.pruneTv(v);
    }
  }

  /** Conserva solo los ultimos TV_KEEP llamados por pantalla (no borra los recientes). */
  private async pruneTv(screen: number): Promise<void> {
    const keep = await this.tvModel.findAll({
      where: { Estado: screen },
      order: [["IdTv", "DESC"]],
      limit: TV_KEEP,
      attributes: ["IdTv"],
    });
    const ids = keep.map((k) => k.IdTv);
    if (!ids.length) return;
    await this.tvModel.destroy({
      where: { Estado: screen, IdTv: { [Op.notIn]: ids } },
    });
  }

  private tvRow(
    idTv: number,
    modulo: string,
    turno: string,
    servicio: string,
    estadoVisualizador: number
  ) {
    return {
      IdTv: idTv,
      NombrePaciente: "",
      Modulo: modulo,
      Servicio: servicio,
      Turno: turno,
      Descripcion: "Modulo",
      Estado: estadoVisualizador,
      IdSede: this.sedeId,
    };
  }

  private async findTabla(id: string): Promise<TablaTemporal> {
    const tabla = await this.tablaModel.findByPk(Number(id));
    if (!tabla) throw new NotFoundException("Turno no encontrado");
    return tabla;
  }

  private buildCode(prefix: string | null, number: number): string {
    const p = (prefix ?? "").trim().toUpperCase();
    return `${p}-${String(number).padStart(3, "0")}`;
  }

  private statusToEstado(status: string): string {
    switch (status) {
      case "waiting":
        return this.estadoEspera;
      case "called":
      case "serving":
        return this.estadoLlamando;
      case "skipped":
        return this.estadoCancelado;
      case "finished":
      default:
        return this.estadoTerminado;
    }
  }

  private estadoToStatus(estado: string | null): TurnStatus {
    if (estado === this.estadoLlamando) return "called";
    if (estado === this.estadoTerminado) return "finished";
    if (estado === this.estadoCancelado || estado === this.estadoAusente) return "skipped";
    return "waiting";
  }

  private userId(user: AuthUser): number | null {
    const n = Number(user.id);
    return Number.isFinite(n) ? n : null;
  }

  private async serviceDto(idServicio: number): Promise<ServiceDTO> {
    const s = await this.servicioModel.findByPk(idServicio);
    return {
      id: String(idServicio),
      name: s?.Servicio ?? `Servicio ${idServicio}`,
      prefix: s?.Prefijo ?? "",
      active: s?.Eliminado !== 1,
      order: s?.Prioridad ?? 0,
      color: s?.Color && s.Color.trim() ? s.Color : "#2563eb",
      printHeader: null,
      printFooter: null,
    };
  }

  private async toDtos(rows: TablaTemporal[]): Promise<TurnDTO[]> {
    const ids = [...new Set(rows.map((r) => r.IdServicio).filter((v): v is number => v != null))];
    const servicios = ids.length
      ? await this.servicioModel.findAll({ where: { IdServicio: { [Op.in]: ids } } })
      : [];
    const byId = new Map(servicios.map((s) => [s.IdServicio, s]));
    return rows.map((r) => this.mapTabla(r, byId.get(r.IdServicio ?? -1)));
  }

  private async toDto(row: TablaTemporal): Promise<TurnDTO> {
    const s = row.IdServicio
      ? await this.servicioModel.findByPk(row.IdServicio)
      : null;
    return this.mapTabla(row, s ?? undefined);
  }

  private mapTabla(row: TablaTemporal, servicio?: Servicio): TurnDTO {
    const code = row.Turno ?? "";
    return {
      id: String(row.IdTablaTemporal),
      number: Number(code.replace(/[^0-9]/g, "")) || 0,
      code,
      status: this.estadoToStatus(row.Estado),
      serviceId: String(row.IdServicio ?? ""),
      serviceName: servicio?.Servicio ?? undefined,
      servicePrefix: servicio?.Prefijo ?? undefined,
      counterId: null,
      counterName: row.LlamadoPor ?? null,
      createdAt: (row.FechaLlegada ?? new Date()).toISOString(),
      calledAt: row.FechaLlamado ? row.FechaLlamado.toISOString() : null,
      finishedAt: null,
    };
  }

  private async auditoriaToDtos(rows: Auditoria[]): Promise<TurnDTO[]> {
    const ids = [
      ...new Set(rows.map((r) => r.IdServicio).filter((v): v is number => v != null)),
    ];
    const servicios = ids.length
      ? await this.servicioModel.findAll({ where: { IdServicio: { [Op.in]: ids } } })
      : [];
    const byId = new Map(servicios.map((s) => [s.IdServicio, s]));
    return rows.map((row) => {
      const servicio = row.IdServicio ? byId.get(row.IdServicio) : undefined;
      const code = row.Turno ?? "";
      return {
        id: String(row.IdAuditoria),
        number: Number(code.replace(/[^0-9]/g, "")) || 0,
        code,
        status: this.estadoToStatus(row.Estado),
        serviceId: String(row.IdServicio ?? ""),
        serviceName: servicio?.Servicio ?? undefined,
        servicePrefix: servicio?.Prefijo ?? undefined,
        counterId: null,
        counterName: null,
        createdAt: (row.FechaLlegada ?? new Date()).toISOString(),
        calledAt: row.FechaLlamado ? row.FechaLlamado.toISOString() : null,
        finishedAt: row.Fechasalio ? row.Fechasalio.toISOString() : null,
      };
    });
  }

  private async broadcastSnapshot(): Promise<void> {
    const snap = await this.snapshot();
    this.gateway.emitQueueUpdated(snap);
  }
}
