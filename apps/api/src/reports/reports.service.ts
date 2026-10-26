import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectConnection } from "@nestjs/sequelize";
import { QueryTypes, type Sequelize } from "sequelize";
import type {
  ReportAbsenteeism,
  ReportAbsenteeismRow,
  ReportAgentRow,
  ReportAgents,
  ReportCalls,
  ReportDemand,
  ReportExportType,
  ReportRange,
  ReportRatingAgent,
  ReportRatingQuestion,
  ReportRatingValue,
  ReportRatings,
  ReportSummary,
  ReportTimeRow,
  ReportTimes,
  ReportTurnRow,
  ReportTurnsPage,
} from "@turnero/shared";
import type { ExportQueryDto, ReportQueryDto } from "./dto/report-query.dto";

type Row = Record<string, unknown>;

const TRANSFER = "TRANSFERIDO";
const FINISHED_SQL = "COALESCE(a.Observacion,'') <> 'TRANSFERIDO' AND a.Estado = 'TERMINADO'";
const ABSENT_SQL = "a.Estado = 'AUSENTE'";
const TRANSFERRED_SQL = "a.Observacion = 'TRANSFERIDO' AND a.Estado = 'TERMINADO'";
const TICKET_SQL = "COALESCE(a.Observacion,'') <> 'TRANSFERIDO'";
const WAIT_SEC_SQL =
  "TIMESTAMPDIFF(SECOND, a.FechaLlegada, a.FechaLlamado)";
const ATTENTION_SEC_SQL =
  "TIMESTAMPDIFF(SECOND, a.FechaLlamado, a.Fechasalio)";
const RATINGS_SOURCE =
  "(SELECT DISTINCT IdCalificacion, NumCalif, IdUsuario, FechaCalif, IdPregunta, IdAuditoria, IdSede FROM calificacion) c";
const RATINGS_VALUE_JOIN =
  "JOIN (SELECT IdValorCalif, MAX(Valor) AS Valor FROM valorcalif GROUP BY IdValorCalif) v ON v.IdValorCalif = c.NumCalif";
const RATINGS_QUESTION_JOIN =
  "LEFT JOIN (SELECT IdPregunta, MAX(Pregunta) AS Pregunta FROM preguntas GROUP BY IdPregunta) p ON p.IdPregunta = c.IdPregunta";

function todayLima(): string {
  const now = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDay(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException("La fecha debe tener formato YYYY-MM-DD");
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new BadRequestException(`Fecha invalida: ${value}`);
  }
  return date;
}

function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  const cursor = parseDay(from);
  const end = parseDay(to);
  while (cursor.getTime() <= end.getTime()) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1)
  );
  return Math.round(sorted[index]);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function csvLima(value: unknown): string {
  const iso = toIso(value);
  if (!iso) return "";
  return new Date(new Date(iso).getTime() - 5 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
}

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function csv(rows: unknown[][]): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

@Injectable()
export class ReportsService {
  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    private readonly config: ConfigService
  ) {}

  private get sedeId(): number | null {
    const raw = this.config.get<string>("SEDE_ID");
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  }

  private resolveRange(query: { from?: string; to?: string }): ReportRange {
    const today = todayLima();
    const from = query.from ?? today;
    const to = query.to ?? today;
    const fromDate = parseDay(from);
    const toDate = parseDay(to);
    if (toDate.getTime() < fromDate.getTime()) {
      throw new BadRequestException("La fecha final no puede ser menor que la inicial");
    }
    const days = Math.floor((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
    if (days > 366) {
      throw new BadRequestException("El rango maximo de reportes es de 366 dias");
    }
    return { from, to };
  }

  private buildWhere(
    range: ReportRange,
    opts: {
      serviceId?: number;
      userId?: number;
      includeTransfers?: boolean;
      onlyCalled?: boolean;
      finalOnly?: boolean;
    } = {}
  ): { sql: string; params: Row } {
    const clauses = ["a.FechaLlegada >= :fromSql", "a.FechaLlegada <= :toSql"];
    const params: Row = {
      fromSql: `${range.from} 00:00:00`,
      toSql: `${range.to} 23:59:59`,
    };
    if (this.sedeId !== null) {
      clauses.push("a.IdSede = :sedeId");
      params.sedeId = this.sedeId;
    }
    if (!opts.includeTransfers) clauses.push(TICKET_SQL);
    if (opts.serviceId) {
      clauses.push("a.IdServicio = :serviceId");
      params.serviceId = opts.serviceId;
    }
    if (opts.userId) {
      clauses.push("a.IdUsuario = :userId");
      params.userId = opts.userId;
    }
    if (opts.onlyCalled) {
      clauses.push("a.FechaLlamado IS NOT NULL", "a.FechaLlamado >= a.FechaLlegada");
    }
    if (opts.finalOnly) {
      clauses.push("a.Estado <> 'NORMAL'");
    }
    return { sql: clauses.join(" AND "), params };
  }

  private buildCalledWhere(
    range: ReportRange,
    opts: { serviceId?: number; userId?: number } = {}
  ): { sql: string; params: Row } {
    const clauses = [
      "a.FechaLlamado IS NOT NULL",
      "a.FechaLlamado >= :fromSql",
      "a.FechaLlamado <= :toSql",
    ];
    const params: Row = {
      fromSql: `${range.from} 00:00:00`,
      toSql: `${range.to} 23:59:59`,
    };
    if (this.sedeId !== null) {
      clauses.push("a.IdSede = :sedeId");
      params.sedeId = this.sedeId;
    }
    if (opts.serviceId) {
      clauses.push("a.IdServicio = :serviceId");
      params.serviceId = opts.serviceId;
    }
    if (opts.userId) {
      clauses.push("a.IdUsuario = :userId");
      params.userId = opts.userId;
    }
    return { sql: clauses.join(" AND "), params };
  }

  private async serviceNames(ids: number[]): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    const unique = [...new Set(ids.filter((id) => Number.isFinite(id)))];
    if (unique.length === 0) return map;
    const rows = (await this.sequelize.query(
      `SELECT IdServicio, MAX(Servicio) AS name
       FROM servicio
       WHERE IdServicio IN (:ids)
       GROUP BY IdServicio`,
      { replacements: { ids: unique }, type: QueryTypes.SELECT }
    )) as Row[];
    for (const row of rows) {
      const id = Number(row.IdServicio);
      map.set(id, String(row.name ?? `Servicio ${id}`));
    }
    return map;
  }

  private async userNames(ids: number[]): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    const unique = [...new Set(ids.filter((id) => Number.isFinite(id)))];
    if (unique.length === 0) return map;
    const rows = (await this.sequelize.query(
      `SELECT IdUsuario, MAX(NombreCompleto) AS name
       FROM usuario
       WHERE IdUsuario IN (:ids)
       GROUP BY IdUsuario`,
      { replacements: { ids: unique }, type: QueryTypes.SELECT }
    )) as Row[];
    for (const row of rows) {
      const id = Number(row.IdUsuario);
      map.set(id, String(row.name ?? `Asesor ${id}`));
    }
    return map;
  }

  private serviceName(map: Map<number, string>, id: number | null): string {
    if (id === null) return "Sin servicio";
    return map.get(id) ?? `Servicio ${id}`;
  }

  private userName(map: Map<number, string>, id: number): string {
    return map.get(id) ?? `Asesor ${id}`;
  }

  async summary(query: ReportQueryDto): Promise<ReportSummary> {
    const range = this.resolveRange(query);
    const { sql, params } = this.buildWhere(range, {
      serviceId: query.serviceId,
      includeTransfers: true,
    });

    const totalsRows = (await this.sequelize.query(
      `SELECT
        SUM(CASE WHEN ${TICKET_SQL} THEN 1 ELSE 0 END) AS tickets,
        SUM(CASE WHEN ${TICKET_SQL} AND a.FechaLlamado IS NOT NULL THEN 1 ELSE 0 END) AS called,
        SUM(CASE WHEN ${FINISHED_SQL} THEN 1 ELSE 0 END) AS finished,
        SUM(CASE WHEN ${ABSENT_SQL} THEN 1 ELSE 0 END) AS absent,
        SUM(CASE WHEN ${TRANSFERRED_SQL} THEN 1 ELSE 0 END) AS transferred,
        SUM(CASE WHEN ${TICKET_SQL} AND a.Estado NOT IN ('TERMINADO','AUSENTE','NORMAL') THEN 1 ELSE 0 END) AS cancelled,
        SUM(CASE WHEN ${TICKET_SQL} AND a.Estado <> 'NORMAL' THEN 1 ELSE 0 END) AS final,
        AVG(CASE WHEN ${TICKET_SQL} AND a.FechaLlamado IS NOT NULL AND a.FechaLlamado >= a.FechaLlegada
          THEN ${WAIT_SEC_SQL} END) AS waitAvg,
        AVG(CASE WHEN ${FINISHED_SQL} AND a.Fechasalio IS NOT NULL AND a.Fechasalio >= a.FechaLlamado
          THEN ${ATTENTION_SEC_SQL} END) AS attentionAvg,
        AVG(CASE WHEN ${FINISHED_SQL} AND a.Fechasalio IS NOT NULL AND a.Fechasalio >= a.FechaLlegada
          THEN TIMESTAMPDIFF(SECOND, a.FechaLlegada, a.Fechasalio) END) AS totalAvg
       FROM auditoria a
       WHERE ${sql}`,
      { replacements: params, type: QueryTypes.SELECT }
    )) as Row[];
    const totals = totalsRows[0] ?? {};

    const queuedWhere = this.sedeId !== null ? "WHERE IdSede = :sedeId" : "";
    const queuedRows = (await this.sequelize.query(
      `SELECT
        SUM(CASE WHEN Estado = 'NORMAL' THEN 1 ELSE 0 END) AS waitingNow,
        SUM(CASE WHEN LOWER(Estado) = 'aplazado' THEN 1 ELSE 0 END) AS deferredNow
       FROM tablatemporal ${queuedWhere}`,
      {
        replacements: this.sedeId !== null ? { sedeId: this.sedeId } : {},
        type: QueryTypes.SELECT,
      }
    )) as Row[];
    const queued = queuedRows[0] ?? {};

    const hourRows = (await this.sequelize.query(
      `SELECT
        HOUR(a.FechaLlegada) AS hour,
        SUM(CASE WHEN ${TICKET_SQL} THEN 1 ELSE 0 END) AS tickets,
        SUM(CASE WHEN ${FINISHED_SQL} THEN 1 ELSE 0 END) AS finished,
        SUM(CASE WHEN ${ABSENT_SQL} THEN 1 ELSE 0 END) AS absent
       FROM auditoria a
       WHERE ${sql}
       GROUP BY HOUR(a.FechaLlegada)
       ORDER BY hour`,
      { replacements: params, type: QueryTypes.SELECT }
    )) as Row[];
    const hourMap = new Map(hourRows.map((row) => [Number(row.hour), row]));
    const byHour = Array.from({ length: 24 }, (_, hour) => {
      const row = hourMap.get(hour);
      return {
        hour,
        tickets: toNumber(row?.tickets),
        finished: toNumber(row?.finished),
        absent: toNumber(row?.absent),
      };
    });

    const dayRows = (await this.sequelize.query(
      `SELECT
        DATE_FORMAT(a.FechaLlegada, '%Y-%m-%d') AS day,
        SUM(CASE WHEN ${TICKET_SQL} THEN 1 ELSE 0 END) AS tickets,
        SUM(CASE WHEN ${FINISHED_SQL} THEN 1 ELSE 0 END) AS finished,
        SUM(CASE WHEN ${ABSENT_SQL} THEN 1 ELSE 0 END) AS absent
       FROM auditoria a
       WHERE ${sql}
       GROUP BY DATE_FORMAT(a.FechaLlegada, '%Y-%m-%d')
       ORDER BY day`,
      { replacements: params, type: QueryTypes.SELECT }
    )) as Row[];
    const dayMap = new Map(dayRows.map((row) => [String(row.day), row]));
    const byDay = eachDay(range.from, range.to).map((date) => {
      const row = dayMap.get(date);
      return {
        date,
        tickets: toNumber(row?.tickets),
        finished: toNumber(row?.finished),
        absent: toNumber(row?.absent),
      };
    });

    const serviceRows = (await this.sequelize.query(
      `SELECT
        a.IdServicio AS serviceId,
        SUM(CASE WHEN ${TICKET_SQL} THEN 1 ELSE 0 END) AS tickets,
        SUM(CASE WHEN ${FINISHED_SQL} THEN 1 ELSE 0 END) AS finished,
        SUM(CASE WHEN ${ABSENT_SQL} THEN 1 ELSE 0 END) AS absent,
        SUM(CASE WHEN ${TRANSFERRED_SQL} THEN 1 ELSE 0 END) AS transferred,
        AVG(CASE WHEN ${TICKET_SQL} AND a.FechaLlamado IS NOT NULL AND a.FechaLlamado >= a.FechaLlegada
          THEN ${WAIT_SEC_SQL} END) AS waitAvg,
        AVG(CASE WHEN ${FINISHED_SQL} AND a.Fechasalio IS NOT NULL AND a.Fechasalio >= a.FechaLlamado
          THEN ${ATTENTION_SEC_SQL} END) AS attentionAvg
       FROM auditoria a
       WHERE ${sql}
       GROUP BY a.IdServicio
       ORDER BY tickets DESC`,
      { replacements: params, type: QueryTypes.SELECT }
    )) as Row[];
    const names = await this.serviceNames(
      serviceRows.map((row) => Number(row.serviceId)).filter((id) => Number.isFinite(id))
    );
    const byService = serviceRows.map((row) => {
      const serviceId = row.serviceId === null ? null : Number(row.serviceId);
      return {
        serviceId,
        name: this.serviceName(names, serviceId),
        tickets: toNumber(row.tickets),
        finished: toNumber(row.finished),
        absent: toNumber(row.absent),
        transferred: toNumber(row.transferred),
        waitAvgSec: toNullableNumber(row.waitAvg),
        attentionAvgSec: toNullableNumber(row.attentionAvg),
      };
    });

    const finished = toNumber(totals.finished);
    const absent = toNumber(totals.absent);
    const conclusive = toNumber(totals.final);

    return {
      range,
      totals: {
        tickets: toNumber(totals.tickets),
        called: toNumber(totals.called),
        finished,
        absent,
        transferred: toNumber(totals.transferred),
        cancelled: toNumber(totals.cancelled),
        waitingNow: toNumber(queued.waitingNow),
        deferredNow: toNumber(queued.deferredNow),
      },
      averages: {
        waitSec: toNullableNumber(totals.waitAvg),
        attentionSec: toNullableNumber(totals.attentionAvg),
        totalSec: toNullableNumber(totals.totalAvg),
      },
      rates: {
        absent: conclusive > 0 ? round1((absent / conclusive) * 100) : 0,
        finished: conclusive > 0 ? round1((finished / conclusive) * 100) : 0,
      },
      byHour,
      byDay,
      byService,
    };
  }

  private async queryTurns(
    range: ReportRange,
    query: ReportQueryDto,
    limit: number | null
  ): Promise<{ rows: ReportTurnRow[]; total: number; page: number; pageSize: number }> {
    const status = query.status ?? "all";
    const includeTransfers = status === "transferred";
    const { sql, params } = this.buildWhere(range, {
      serviceId: query.serviceId,
      userId: query.userId,
      includeTransfers,
    });
    const conditions = [sql];
    if (status === "finished") conditions.push(FINISHED_SQL);
    if (status === "absent") conditions.push(ABSENT_SQL);
    if (status === "transferred") conditions.push(TRANSFERRED_SQL);
    if (status === "waiting") conditions.push("a.Estado = 'NORMAL'");
    if (status === "cancelled") {
      conditions.push("a.Estado NOT IN ('TERMINADO','AUSENTE','NORMAL')");
    }
    const where = conditions.join(" AND ");

    const countRows = (await this.sequelize.query(
      `SELECT COUNT(*) AS total FROM auditoria a WHERE ${where}`,
      { replacements: params, type: QueryTypes.SELECT }
    )) as Row[];
    const total = toNumber(countRows[0]?.total);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const pageParams: Row = { ...params };
    let limitSql = "";
    if (limit !== null) {
      pageParams.limit = limit;
      pageParams.offset = (page - 1) * limit;
      limitSql = "LIMIT :limit OFFSET :offset";
    }

    const rows = (await this.sequelize.query(
      `SELECT
        a.IdAuditoria AS id,
        a.FechaLlegada AS arrivedAt,
        a.FechaLlamado AS calledAt,
        a.Fechasalio AS finishedAt,
        a.Turno AS turn,
        a.IdServicio AS serviceId,
        a.IdUsuario AS userId,
        a.Estado AS status,
        a.Observacion AS observation,
        a.CedulaCliente AS document,
        a.NombreCliente AS customer,
        COALESCE(a.NumeroLlamados, 0) AS calls,
        CASE WHEN a.FechaLlamado IS NOT NULL AND a.FechaLlamado >= a.FechaLlegada
          THEN ${WAIT_SEC_SQL} END AS waitSec,
        CASE WHEN ${FINISHED_SQL} AND a.Fechasalio IS NOT NULL AND a.Fechasalio >= a.FechaLlamado
          THEN ${ATTENTION_SEC_SQL} END AS attentionSec,
        CASE WHEN ${FINISHED_SQL} AND a.Fechasalio IS NOT NULL AND a.Fechasalio >= a.FechaLlegada
          THEN TIMESTAMPDIFF(SECOND, a.FechaLlegada, a.Fechasalio) END AS totalSec
       FROM auditoria a
       WHERE ${where}
       ORDER BY a.FechaLlegada DESC, a.IdAuditoria DESC
       ${limitSql}`,
      { replacements: pageParams, type: QueryTypes.SELECT }
    )) as Row[];

    const serviceNames = await this.serviceNames(
      rows.map((row) => Number(row.serviceId)).filter((id) => Number.isFinite(id))
    );
    const userNames = await this.userNames(
      rows.map((row) => Number(row.userId)).filter((id) => Number.isFinite(id))
    );

    return {
      rows: rows.map((row) => {
        const serviceId = row.serviceId === null ? null : Number(row.serviceId);
        const userId = row.userId === null ? null : Number(row.userId);
        return {
          id: Number(row.id),
          arrivedAt: toIso(row.arrivedAt),
          calledAt: toIso(row.calledAt),
          finishedAt: toIso(row.finishedAt),
          turn: row.turn === null ? null : String(row.turn),
          serviceId,
          serviceName: serviceId === null ? null : this.serviceName(serviceNames, serviceId),
          userId,
          userName: userId === null ? null : this.userName(userNames, userId),
          status: String(row.status ?? ""),
          observation: row.observation === null ? null : String(row.observation),
          document: row.document === null ? null : String(row.document),
          customer: row.customer === null ? null : String(row.customer),
          calls: toNumber(row.calls),
          waitSec: toNullableNumber(row.waitSec),
          attentionSec: toNullableNumber(row.attentionSec),
          totalSec: toNullableNumber(row.totalSec),
        };
      }),
      total,
      page,
      pageSize: limit ?? pageSize,
    };
  }

  async turns(query: ReportQueryDto): Promise<ReportTurnsPage> {
    const range = this.resolveRange(query);
    const result = await this.queryTurns(range, query, query.pageSize ?? 50);
    return { range, ...result };
  }

  async times(query: ReportQueryDto): Promise<ReportTimes> {
    const range = this.resolveRange(query);
    const { sql, params } = this.buildWhere(range, {
      serviceId: query.serviceId,
      onlyCalled: true,
    });
    const rows = (await this.sequelize.query(
      `SELECT
        a.IdServicio AS serviceId,
        a.IdUsuario AS userId,
        a.Estado AS status,
        ${WAIT_SEC_SQL} AS waitSec,
        CASE WHEN ${FINISHED_SQL} AND a.Fechasalio IS NOT NULL AND a.Fechasalio >= a.FechaLlamado
          THEN ${ATTENTION_SEC_SQL} END AS attentionSec
       FROM auditoria a
       WHERE ${sql}`,
      { replacements: params, type: QueryTypes.SELECT }
    )) as Row[];

    const serviceMap = new Map<
      number | null,
      { called: number; finished: number; absent: number; waits: number[]; attentions: number[] }
    >();
    const agentMap = new Map<
      number,
      { called: number; finished: number; absent: number; waits: number[]; attentions: number[] }
    >();

    for (const row of rows) {
      const serviceId = row.serviceId === null ? null : Number(row.serviceId);
      const userId = row.userId === null ? null : Number(row.userId);
      const wait = toNullableNumber(row.waitSec);
      const attention = toNullableNumber(row.attentionSec);
      const finished = String(row.status ?? "") === "TERMINADO";
      const absent = String(row.status ?? "") === "AUSENTE";

      let service = serviceMap.get(serviceId);
      if (!service) {
        service = { called: 0, finished: 0, absent: 0, waits: [], attentions: [] };
        serviceMap.set(serviceId, service);
      }
      service.called += 1;
      if (finished) service.finished += 1;
      if (absent) service.absent += 1;
      if (wait !== null) service.waits.push(wait);
      if (attention !== null) service.attentions.push(attention);

      if (userId !== null) {
        let agent = agentMap.get(userId);
        if (!agent) {
          agent = { called: 0, finished: 0, absent: 0, waits: [], attentions: [] };
          agentMap.set(userId, agent);
        }
        agent.called += 1;
        if (finished) agent.finished += 1;
        if (absent) agent.absent += 1;
        if (wait !== null) agent.waits.push(wait);
        if (attention !== null) agent.attentions.push(attention);
      }
    }

    const serviceNames = await this.serviceNames(
      [...serviceMap.keys()].filter((id): id is number => id !== null)
    );
    const userNames = await this.userNames([...agentMap.keys()]);

    const toRow = (
      key: number | null,
      name: string,
      acc: { called: number; finished: number; absent: number; waits: number[]; attentions: number[] }
    ): ReportTimeRow => ({
      key,
      name,
      called: acc.called,
      finished: acc.finished,
      absent: acc.absent,
      waitAvgSec: average(acc.waits),
      waitMedianSec: percentile(acc.waits, 0.5),
      waitP90Sec: percentile(acc.waits, 0.9),
      attentionAvgSec: average(acc.attentions),
      attentionMedianSec: percentile(acc.attentions, 0.5),
      attentionP90Sec: percentile(acc.attentions, 0.9),
    });

    const byService = [...serviceMap.entries()]
      .map(([key, acc]) => toRow(key, this.serviceName(serviceNames, key), acc))
      .sort((a, b) => a.name.localeCompare(b.name));

    const byAgent = [...agentMap.entries()]
      .map(([key, acc]) => toRow(key, this.userName(userNames, key), acc))
      .sort((a, b) => b.called - a.called || a.name.localeCompare(b.name));

    return { range, byService, byAgent };
  }

  private async agentRows(
    range: ReportRange,
    query: ReportQueryDto
  ): Promise<ReportAgentRow[]> {
    const { sql, params } = this.buildCalledWhere(range, {
      serviceId: query.serviceId,
      userId: query.userId,
    });
    const rows = (await this.sequelize.query(
      `SELECT
        a.IdUsuario AS userId,
        COUNT(*) AS calls,
        SUM(CASE WHEN ${FINISHED_SQL} THEN 1 ELSE 0 END) AS finished,
        SUM(CASE WHEN ${ABSENT_SQL} THEN 1 ELSE 0 END) AS absent,
        SUM(CASE WHEN ${TRANSFERRED_SQL} THEN 1 ELSE 0 END) AS transferred,
        AVG(CASE WHEN a.FechaLlamado >= a.FechaLlegada THEN ${WAIT_SEC_SQL} END) AS waitAvg,
        AVG(CASE WHEN ${FINISHED_SQL} AND a.Fechasalio IS NOT NULL AND a.Fechasalio >= a.FechaLlamado
          THEN ${ATTENTION_SEC_SQL} END) AS attentionAvg,
        MIN(a.FechaLlamado) AS firstCallAt,
        MAX(a.FechaLlamado) AS lastCallAt
       FROM auditoria a
       WHERE ${sql} AND a.IdUsuario IS NOT NULL
       GROUP BY a.IdUsuario
       ORDER BY calls DESC`,
      { replacements: params, type: QueryTypes.SELECT }
    )) as Row[];
    const names = await this.userNames(rows.map((row) => Number(row.userId)));

    return rows.map((row) => ({
      userId: Number(row.userId),
      name: this.userName(names, Number(row.userId)),
      calls: toNumber(row.calls),
      finished: toNumber(row.finished),
      absent: toNumber(row.absent),
      transferred: toNumber(row.transferred),
      waitAvgSec: toNullableNumber(row.waitAvg),
      attentionAvgSec: toNullableNumber(row.attentionAvg),
      firstCallAt: toIso(row.firstCallAt),
      lastCallAt: toIso(row.lastCallAt),
    }));
  }

  async agents(query: ReportQueryDto): Promise<ReportAgents> {
    const range = this.resolveRange(query);
    return { range, rows: await this.agentRows(range, query) };
  }

  async calls(query: ReportQueryDto): Promise<ReportCalls> {
    const range = this.resolveRange(query);
    const rows = await this.agentRows(range, query);
    const { sql, params } = this.buildCalledWhere(range, {
      serviceId: query.serviceId,
      userId: query.userId,
    });
    const dayRows = (await this.sequelize.query(
      `SELECT DATE_FORMAT(a.FechaLlamado, '%Y-%m-%d') AS day, COUNT(*) AS calls
       FROM auditoria a
       WHERE ${sql}
       GROUP BY DATE_FORMAT(a.FechaLlamado, '%Y-%m-%d')
       ORDER BY day`,
      { replacements: params, type: QueryTypes.SELECT }
    )) as Row[];
    const dayMap = new Map(dayRows.map((row) => [String(row.day), toNumber(row.calls)]));
    const byDay = eachDay(range.from, range.to).map((date) => ({
      date,
      calls: dayMap.get(date) ?? 0,
    }));
    return {
      range,
      total: rows.reduce((sum, row) => sum + row.calls, 0),
      rows,
      byDay,
    };
  }

  async absenteeism(query: ReportQueryDto): Promise<ReportAbsenteeism> {
    const range = this.resolveRange(query);
    const { sql, params } = this.buildWhere(range, {
      serviceId: query.serviceId,
      userId: query.userId,
      finalOnly: true,
    });
    const rows = (await this.sequelize.query(
      `SELECT
        a.IdServicio AS serviceId,
        a.IdUsuario AS userId,
        HOUR(a.FechaLlegada) AS hour,
        COUNT(*) AS total,
        SUM(CASE WHEN ${ABSENT_SQL} THEN 1 ELSE 0 END) AS absent
       FROM auditoria a
       WHERE ${sql}
       GROUP BY a.IdServicio, a.IdUsuario, HOUR(a.FechaLlegada)`,
      { replacements: params, type: QueryTypes.SELECT }
    )) as Row[];

    const serviceMap = new Map<number | null, { total: number; absent: number }>();
    const agentMap = new Map<number, { total: number; absent: number }>();
    const hourMap = new Map<number, { total: number; absent: number }>();
    let total = 0;
    let absent = 0;

    for (const row of rows) {
      const rowTotal = toNumber(row.total);
      const rowAbsent = toNumber(row.absent);
      total += rowTotal;
      absent += rowAbsent;

      const serviceId = row.serviceId === null ? null : Number(row.serviceId);
      const userId = row.userId === null ? null : Number(row.userId);
      const hour = toNumber(row.hour);

      const service = serviceMap.get(serviceId) ?? { total: 0, absent: 0 };
      service.total += rowTotal;
      service.absent += rowAbsent;
      serviceMap.set(serviceId, service);

      if (userId !== null) {
        const agent = agentMap.get(userId) ?? { total: 0, absent: 0 };
        agent.total += rowTotal;
        agent.absent += rowAbsent;
        agentMap.set(userId, agent);
      }

      const hourEntry = hourMap.get(hour) ?? { total: 0, absent: 0 };
      hourEntry.total += rowTotal;
      hourEntry.absent += rowAbsent;
      hourMap.set(hour, hourEntry);
    }

    const serviceNames = await this.serviceNames(
      [...serviceMap.keys()].filter((id): id is number => id !== null)
    );
    const userNames = await this.userNames([...agentMap.keys()]);

    const rate = (value: number, base: number): number =>
      base > 0 ? round1((value / base) * 100) : 0;

    const byService: ReportAbsenteeismRow[] = [...serviceMap.entries()]
      .map(([key, value]) => ({
        key,
        name: this.serviceName(serviceNames, key),
        total: value.total,
        absent: value.absent,
        rate: rate(value.absent, value.total),
      }))
      .sort((a, b) => b.rate - a.rate || b.total - a.total);

    const byAgent: ReportAbsenteeismRow[] = [...agentMap.entries()]
      .map(([key, value]) => ({
        key,
        name: this.userName(userNames, key),
        total: value.total,
        absent: value.absent,
        rate: rate(value.absent, value.total),
      }))
      .sort((a, b) => b.rate - a.rate || b.total - a.total);

    const byHour = Array.from({ length: 24 }, (_, hour) => {
      const value = hourMap.get(hour) ?? { total: 0, absent: 0 };
      return {
        hour,
        total: value.total,
        absent: value.absent,
        rate: rate(value.absent, value.total),
      };
    });

    return { range, total, absent, rate: rate(absent, total), byService, byAgent, byHour };
  }

  async demand(query: ReportQueryDto): Promise<ReportDemand> {
    const range = this.resolveRange(query);
    const { sql, params } = this.buildWhere(range, {
      serviceId: query.serviceId,
      userId: query.userId,
    });
    const rows = (await this.sequelize.query(
      `SELECT
        WEEKDAY(a.FechaLlegada) AS weekday,
        HOUR(a.FechaLlegada) AS hour,
        COUNT(*) AS count
       FROM auditoria a
       WHERE ${sql}
       GROUP BY WEEKDAY(a.FechaLlegada), HOUR(a.FechaLlegada)
       ORDER BY weekday, hour`,
      { replacements: params, type: QueryTypes.SELECT }
    )) as Row[];
    const cells = rows.map((row) => ({
      weekday: toNumber(row.weekday),
      hour: toNumber(row.hour),
      count: toNumber(row.count),
    }));
    return {
      range,
      total: cells.reduce((sum, cell) => sum + cell.count, 0),
      max: cells.reduce((max, cell) => Math.max(max, cell.count), 0),
      cells,
    };
  }

  async ratings(query: ReportQueryDto): Promise<ReportRatings> {
    const range = this.resolveRange(query);
    const clauses = ["c.FechaCalif >= :fromSql", "c.FechaCalif <= :toSql"];
    const params: Row = {
      fromSql: `${range.from} 00:00:00`,
      toSql: `${range.to} 23:59:59`,
    };
    if (this.sedeId !== null) {
      clauses.push("c.IdSede = :sedeId");
      params.sedeId = this.sedeId;
    }
    if (query.userId) {
      clauses.push("c.IdUsuario = :userId");
      params.userId = query.userId;
    }
    if (query.serviceId) {
      const serviceFilter =
        this.sedeId !== null
          ? "SELECT IdAuditoria FROM auditoria WHERE IdServicio = :serviceId AND IdSede = :sedeId"
          : "SELECT IdAuditoria FROM auditoria WHERE IdServicio = :serviceId";
      clauses.push(`c.IdAuditoria IN (${serviceFilter})`);
      params.serviceId = query.serviceId;
    }
    const where = clauses.join(" AND ");

    const valueRows = (await this.sequelize.query(
      `SELECT v.Valor AS value, COUNT(*) AS count
       FROM ${RATINGS_SOURCE}
       ${RATINGS_VALUE_JOIN}
       WHERE ${where}
       GROUP BY v.Valor
       ORDER BY count DESC`,
      { replacements: params, type: QueryTypes.SELECT }
    )) as Row[];
    const total = valueRows.reduce((sum, row) => sum + toNumber(row.count), 0);
    const toValues = (rows: Row[]): ReportRatingValue[] => {
      const base = rows.reduce((sum, row) => sum + toNumber(row.count), 0);
      return rows.map((row) => ({
        value: String(row.value ?? "Sin valor"),
        count: toNumber(row.count),
        pct: base > 0 ? round1((toNumber(row.count) / base) * 100) : 0,
      }));
    };
    const byValue = toValues(valueRows);

    const agentRows = (await this.sequelize.query(
      `SELECT c.IdUsuario AS userId, v.Valor AS value, COUNT(*) AS count
       FROM ${RATINGS_SOURCE}
       ${RATINGS_VALUE_JOIN}
       WHERE ${where} AND c.IdUsuario IS NOT NULL
       GROUP BY c.IdUsuario, v.Valor
       ORDER BY c.IdUsuario, count DESC`,
      { replacements: params, type: QueryTypes.SELECT }
    )) as Row[];
    const userNames = await this.userNames(
      agentRows.map((row) => Number(row.userId)).filter((id) => Number.isFinite(id))
    );
    const agentMap = new Map<number, Row[]>();
    for (const row of agentRows) {
      const userId = Number(row.userId);
      const list = agentMap.get(userId) ?? [];
      list.push(row);
      agentMap.set(userId, list);
    }
    const byAgent: ReportRatingAgent[] = [...agentMap.entries()]
      .map(([userId, rows]) => {
        const values = toValues(rows);
        return {
          userId,
          name: this.userName(userNames, userId),
          total: values.reduce((sum, value) => sum + value.count, 0),
          values,
        };
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    const questionRows = (await this.sequelize.query(
      `SELECT c.IdPregunta AS questionId, MAX(p.Pregunta) AS question,
        v.Valor AS value, COUNT(*) AS count
       FROM ${RATINGS_SOURCE}
       ${RATINGS_VALUE_JOIN}
       ${RATINGS_QUESTION_JOIN}
       WHERE ${where}
       GROUP BY c.IdPregunta, v.Valor
       ORDER BY c.IdPregunta, count DESC`,
      { replacements: params, type: QueryTypes.SELECT }
    )) as Row[];
    const questionMap = new Map<number | null, { question: string; rows: Row[] }>();
    for (const row of questionRows) {
      const questionId = row.questionId === null ? null : Number(row.questionId);
      const entry = questionMap.get(questionId) ?? {
        question: String(row.question ?? "Sin pregunta"),
        rows: [],
      };
      entry.rows.push(row);
      questionMap.set(questionId, entry);
    }
    const byQuestion: ReportRatingQuestion[] = [...questionMap.entries()]
      .map(([questionId, entry]) => {
        const values = toValues(entry.rows);
        return {
          questionId,
          question: entry.question,
          total: values.reduce((sum, value) => sum + value.count, 0),
          values,
        };
      })
      .sort((a, b) => a.question.localeCompare(b.question));

    const dayRows = (await this.sequelize.query(
      `SELECT DATE_FORMAT(c.FechaCalif, '%Y-%m-%d') AS day, COUNT(*) AS total
       FROM ${RATINGS_SOURCE}
       WHERE ${where}
       GROUP BY DATE_FORMAT(c.FechaCalif, '%Y-%m-%d')
       ORDER BY day`,
      { replacements: params, type: QueryTypes.SELECT }
    )) as Row[];
    const dayMap = new Map(dayRows.map((row) => [String(row.day), toNumber(row.total)]));
    const byDay = eachDay(range.from, range.to).map((date) => ({
      date,
      total: dayMap.get(date) ?? 0,
    }));

    return { range, total, byValue, byAgent, byQuestion, byDay };
  }

  async exportCsv(query: ExportQueryDto): Promise<{ filename: string; content: string }> {
    const range = this.resolveRange(query);
    const report: ReportExportType = query.report;
    let rows: unknown[][] = [];

    if (report === "summary") {
      const summary = await this.summary(query);
      rows = [
        ["Reporte", "Resumen"],
        ["Desde", range.from],
        ["Hasta", range.to],
        [],
        ["Indicador", "Valor"],
        ["Turnos generados", summary.totals.tickets],
        ["Llamados", summary.totals.called],
        ["Atendidos", summary.totals.finished],
        ["Ausentes", summary.totals.absent],
        ["Transferidos", summary.totals.transferred],
        ["Cancelados", summary.totals.cancelled],
        ["En espera ahora", summary.totals.waitingNow],
        ["Aplazados ahora", summary.totals.deferredNow],
        ["Espera promedio (s)", summary.averages.waitSec ?? ""],
        ["Atencion promedio (s)", summary.averages.attentionSec ?? ""],
        ["Tiempo total promedio (s)", summary.averages.totalSec ?? ""],
        ["% ausentismo", summary.rates.absent],
        [],
        [
          "Servicio",
          "Turnos",
          "Atendidos",
          "Ausentes",
          "Transferidos",
          "Espera prom (s)",
          "Atencion prom (s)",
        ],
        ...summary.byService.map((service) => [
          service.name,
          service.tickets,
          service.finished,
          service.absent,
          service.transferred,
          service.waitAvgSec ?? "",
          service.attentionAvgSec ?? "",
        ]),
      ];
    }

    if (report === "turns") {
      const turns = await this.queryTurns(range, { ...query, page: 1 }, null);
      rows = [
        [
          "Fecha llegada",
          "Turno",
          "Servicio",
          "Asesor",
          "Estado",
          "Espera (s)",
          "Atencion (s)",
          "Total (s)",
          "Llamados",
          "Documento",
          "Cliente",
          "Observacion",
        ],
        ...turns.rows.map((turn) => [
          csvLima(turn.arrivedAt),
          turn.turn ?? "",
          turn.serviceName ?? "",
          turn.userName ?? "",
          turn.observation === TRANSFER ? TRANSFER : turn.status,
          turn.waitSec ?? "",
          turn.attentionSec ?? "",
          turn.totalSec ?? "",
          turn.calls,
          turn.document ?? "",
          turn.customer ?? "",
          turn.observation ?? "",
        ]),
      ];
    }

    if (report === "times") {
      const times = await this.times(query);
      rows = [
        [
          "Tipo",
          "Nombre",
          "Llamados",
          "Atendidos",
          "Ausentes",
          "Espera prom (s)",
          "Espera mediana (s)",
          "Espera p90 (s)",
          "Atencion prom (s)",
          "Atencion mediana (s)",
          "Atencion p90 (s)",
        ],
        ...times.byService.map((row) => ["Servicio", ...this.timeCsvRow(row)]),
        ...times.byAgent.map((row) => ["Asesor", ...this.timeCsvRow(row)]),
      ];
    }

    if (report === "absenteeism") {
      const data = await this.absenteeism(query);
      rows = [
        ["Tipo", "Nombre", "Total", "Ausentes", "% ausentismo"],
        ...data.byService.map((row) => ["Servicio", row.name, row.total, row.absent, row.rate]),
        ...data.byAgent.map((row) => ["Asesor", row.name, row.total, row.absent, row.rate]),
        ...data.byHour.map((row) => [
          "Hora",
          String(row.hour).padStart(2, "0"),
          row.total,
          row.absent,
          row.rate,
        ]),
      ];
    }

    if (report === "agents") {
      const data = await this.agents(query);
      rows = [
        [
          "Asesor",
          "Llamados",
          "Atendidos",
          "Ausentes",
          "Transferidos",
          "Espera prom (s)",
          "Atencion prom (s)",
          "Primera llamada",
          "Ultima llamada",
        ],
        ...data.rows.map((row) => [
          row.name,
          row.calls,
          row.finished,
          row.absent,
          row.transferred,
          row.waitAvgSec ?? "",
          row.attentionAvgSec ?? "",
          csvLima(row.firstCallAt),
          csvLima(row.lastCallAt),
        ]),
      ];
    }

    if (report === "calls") {
      const data = await this.calls(query);
      rows = [
        [
          "Asesor",
          "Llamados",
          "Atendidos",
          "Ausentes",
          "Transferidos",
          "Espera prom (s)",
          "Primera llamada",
          "Ultima llamada",
        ],
        ...data.rows.map((row) => [
          row.name,
          row.calls,
          row.finished,
          row.absent,
          row.transferred,
          row.waitAvgSec ?? "",
          csvLima(row.firstCallAt),
          csvLima(row.lastCallAt),
        ]),
      ];
    }

    if (report === "demand") {
      const data = await this.demand(query);
      const days = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];
      const cellMap = new Map(
        data.cells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell.count])
      );
      rows = [
        ["Dia", ...Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, "0")}:00`)],
        ...days.map((day, weekday) => [
          day,
          ...Array.from({ length: 24 }, (_, hour) => cellMap.get(`${weekday}-${hour}`) ?? 0),
        ]),
      ];
    }

    if (report === "ratings") {
      const data = await this.ratings(query);
      rows = [
        ["Tipo", "Nombre", "Valor", "Cantidad", "%"],
        ["General", "Todas las calificaciones", "", data.total, 100],
        ...data.byValue.map((value) => ["General", "Distribucion", value.value, value.count, value.pct]),
        ...data.byAgent.flatMap((agent) =>
          agent.values.map((value) => [
            "Asesor",
            agent.name,
            value.value,
            value.count,
            value.pct,
          ])
        ),
        ...data.byQuestion.flatMap((question) =>
          question.values.map((value) => [
            "Pregunta",
            question.question,
            value.value,
            value.count,
            value.pct,
          ])
        ),
      ];
    }

    return {
      filename: `reporte-${report}-${range.from}-${range.to}.csv`,
      content: csv(rows),
    };
  }

  private timeCsvRow(row: ReportTimeRow): unknown[] {
    return [
      row.name,
      row.called,
      row.finished,
      row.absent,
      row.waitAvgSec ?? "",
      row.waitMedianSec ?? "",
      row.waitP90Sec ?? "",
      row.attentionAvgSec ?? "",
      row.attentionMedianSec ?? "",
      row.attentionP90Sec ?? "",
    ];
  }
}
