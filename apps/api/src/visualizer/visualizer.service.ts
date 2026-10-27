import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { listVideoFiles } from "../media/video-files";
import { Configtv } from "../models/configtv.model";
import { Tv } from "../models/tv.model";
import { Video } from "../models/video.model";

export interface VisualizerTurn {
  idtv: number;
  nombrePaciente: string;
  modulo: string;
  servicio: string;
  turno: string;
  descripcion: string;
  estado: number;
  nombre: string;
  tipo: "PACIENTE" | "TURNO";
}

export interface VisualizerConfig {
  mensaje: string;
  tamanoLetra: number | null;
  nombrelogo: string;
  logo: string;
  cambioTv: string;
  volumenVoz: number | null;
  ipVisualizador: string;
  id: number;
}

export interface VisualizerVideo {
  idVideo: number;
  nombreVideo: string;
  volumen: number | null;
}

const TZ = "America/Bogota";

@Injectable()
export class VisualizerService {
  constructor(
    @InjectModel(Tv) private readonly tvModel: typeof Tv,
    @InjectModel(Configtv) private readonly configModel: typeof Configtv,
    @InjectModel(Video) private readonly videoModel: typeof Video
  ) {}

  /** Lista de pantallas/visualizadores (valores distintos de configtv.estado). */
  async screens(): Promise<number[]> {
    const rows = await this.configModel.findAll({
      attributes: ["estado"],
      group: ["estado"],
    });
    return rows
      .map((r) => r.estado)
      .filter((v): v is number => v != null);
  }

  /** IP configurada para una pantalla (traerIpVisualizador). */
  async ipVisualizador(screen: number): Promise<string | null> {
    const row = await this.configModel.findOne({
      where: { estado: screen },
      attributes: ["IpVisualizador"],
    });
    return row?.IpVisualizador ?? null;
  }

  /** Configuracion del visualizador (cargarConfig).
   *  Si la fila de esta pantalla no tiene un valor (mensaje, logo, tamano de
   *  letra, volumen), se usa el primer valor configurado en cualquier fila.
   *  Asi lo que se guarda en el admin aplica a todas las TVs. */
  async config(screen: number): Promise<VisualizerConfig | null> {
    const rows = await this.configModel.findAll({ order: [["id", "ASC"]] });
    if (!rows.length) return null;

    const own = rows.find((r) => Number(r.estado) === screen) ?? null;
    const ordered = own ? [own, ...rows.filter((r) => r !== own)] : rows;

    const texto = (get: (r: Configtv) => string | null | undefined): string => {
      for (const r of ordered) {
        const v = get(r);
        if (v != null && String(v).trim() !== "") return String(v);
      }
      return "";
    };
    const numero = (get: (r: Configtv) => number | null | undefined): number | null => {
      for (const r of ordered) {
        const v = get(r);
        if (v != null && Number.isFinite(Number(v))) return Number(v);
      }
      return null;
    };

    const nombreLogo = texto((r) => r.nombreLogo);
    return {
      mensaje: texto((r) => r.mensaje),
      tamanoLetra: numero((r) => r.TamanoLetra),
      nombrelogo: nombreLogo,
      logo: nombreLogo,
      cambioTv: texto((r) => r.CambioTv),
      volumenVoz: numero((r) => r.VolumenVoz),
      ipVisualizador: texto((r) => r.IpVisualizador),
      id: (own ?? ordered[0]).id,
    };
  }

  /** Videos asignados a la pantalla (cargarVideos). */
  async videos(screen: number): Promise<VisualizerVideo[]> {
    const rows = await this.videoModel.findAll({ where: { estado: screen } });
    const seen = new Set<number>();
    const out: VisualizerVideo[] = [];
    for (const r of rows) {
      if (seen.has(r.idvideo)) continue;
      seen.add(r.idvideo);
      out.push({
        idVideo: r.idvideo,
        nombreVideo: r.nombrevideo ?? "",
        volumen: r.volumen,
      });
    }
    return out;
  }

  /** Videos disponibles en disco, en el orden en que se subieron. */
  async availableVideos(): Promise<VisualizerVideo[]> {
    const files = await listVideoFiles();

    return files.map((file, index) => ({
      idVideo: index + 1,
      nombreVideo: file.fileName.replace(/\.mp4$/i, ""),
      volumen: 0,
    }));
  }

  /** Llamado vigente de la pantalla, sin consumirlo (para el visor web). */
  async current(screen: number): Promise<VisualizerTurn | null> {
    const row = await this.tvModel.findOne({
      where: { Estado: screen },
      order: [["IdTv", "DESC"]],
    });
    return row ? this.mapTurn(row) : null;
  }

  /** Llamado mas antiguo pendiente, consumiendolo (legacy cargarTurno). */
  async consume(screen: number): Promise<VisualizerTurn | null> {
    const row = await this.tvModel.findOne({
      where: { Estado: screen },
      order: [["IdTv", "ASC"]],
    });
    if (!row) return null;
    const mapped = this.mapTurn(row);
    await row.destroy();
    return mapped;
  }

  /** Fecha y hora formateadas (fechaHora). */
  datetime(): { fecha: string; hora: string } {
    const now = new Date();
    const ymd = now.toLocaleDateString("en-CA", { timeZone: TZ });
    const [y, m, d] = ymd.split("-");
    const weekday = now.toLocaleDateString("es-CO", { timeZone: TZ, weekday: "long" });
    const dia = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    const hora = now
      .toLocaleTimeString("en-US", {
        timeZone: TZ,
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
      .replace(/\u202f/g, " ");
    return { fecha: `${dia} ${d}-${m}-${y}`, hora };
  }

  private mapTurn(row: Tv): VisualizerTurn {
    const nombrePaciente = row.NombrePaciente ?? "";
    const tienePaciente = nombrePaciente.trim() !== "";
    return {
      idtv: row.IdTv,
      nombrePaciente,
      modulo: row.Modulo ?? "",
      servicio: row.Servicio ?? "",
      turno: row.Turno ?? "",
      descripcion: row.Descripcion ?? "",
      estado: row.Estado ?? 0,
      nombre: tienePaciente ? nombrePaciente : row.Turno ?? "",
      tipo: tienePaciente ? "PACIENTE" : "TURNO",
    };
  }
}
