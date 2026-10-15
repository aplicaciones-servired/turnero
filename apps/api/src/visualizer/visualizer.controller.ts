import {
  All,
  Controller,
  Get,
  Header,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { VisualizerService } from "./visualizer.service";

/**
 * Endpoints modernos usados por el visor web (apps/display).
 */
@Controller("visualizer")
@Throttle({ default: { limit: 600, ttl: 60_000 } })
export class VisualizerController {
  constructor(private readonly viz: VisualizerService) {}

  @Get("screens")
  async screens() {
    return { screens: await this.viz.screens() };
  }

  @Get("config")
  config(@Query("screen") screen?: string) {
    return this.viz.config(Number(screen ?? 1));
  }

  @Get("videos")
  videos(@Query("screen") screen?: string) {
    return this.viz.videos(Number(screen ?? 1));
  }

  /** Llamado vigente (no lo consume; el visor deduplica por idtv). */
  @Get("turn")
  turn(@Query("screen") screen?: string) {
    return this.viz.current(Number(screen ?? 1));
  }

  @Get("datetime")
  datetime() {
    return this.viz.datetime();
  }
}

/**
 * Compatibilidad exacta con el APK legacy VisualizadorV1 (consultas.php).
 * Devuelve el sentinel `2` cuando no hay datos y consume el turno al leerlo.
 */
@Controller("visualizador")
@Throttle({ default: { limit: 900, ttl: 60_000 } })
export class LegacyVisualizerController {
  constructor(private readonly viz: VisualizerService) {}

  @All("consultas.php")
  @Header("Content-Type", "application/json")
  async consultas(
    @Query("accion") accion?: string,
    @Query("visualizador") visualizador?: string
  ): Promise<unknown> {
    const screen = Number(visualizador ?? 1);

    switch (accion) {
      case "traerIpVisualizador": {
        const ip = await this.viz.ipVisualizador(screen);
        return ip == null ? 2 : [{ ipVisualizador: ip }];
      }
      case "cargarListaVisualizadores": {
        const screens = await this.viz.screens();
        return screens.length ? screens : 2;
      }
      case "cargarTurno": {
        const turn = await this.viz.consume(screen);
        return turn ? [turn] : 2;
      }
      case "cargarConfig": {
        const cfg = await this.viz.config(screen);
        return cfg ? [cfg] : 2;
      }
      case "cargarVideos":
        return this.viz.availableVideos();
      case "fechaHora":
        return this.viz.datetime();
      default:
        return 2;
    }
  }
}
