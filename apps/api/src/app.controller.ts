import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { InjectConnection } from "@nestjs/sequelize";
import { Sequelize } from "sequelize-typescript";

@Controller()
export class AppController {
  constructor(@InjectConnection() private readonly sequelize: Sequelize) {}

  @Get("health")
  health(): { status: string; uptime: number; timestamp: string } {
    return {
      status: "ok",
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  //
  // Readiness: comprueba que la base legacy responde. `/api/health` solo dice
  // que el proceso esta vivo; este dice si ademas puede atender consultas.
  // Docker sigue usando /api/health para el healthcheck (reiniciar el API no
  // arregla una base caida, solo genera ruido): este endpoint es para el
  // monitoreo y el watchdog.
  @Get("health/ready")
  async ready(): Promise<{ status: string; db: string; timestamp: string }> {
    const ping = this.sequelize.query("SELECT 1");
    ping.catch(() => {
      // Evita un unhandled rejection si el timeout gana la carrera.
    });
    const timeout = new Promise<never>((_, reject) => {
      const t = setTimeout(() => reject(new Error("timeout de base de datos")), 3000);
      if (typeof (t as { unref?: () => void }).unref === "function") {
        (t as { unref?: () => void }).unref!();
      }
    });
    try {
      await Promise.race([ping, timeout]);
      return { status: "ready", db: "ok", timestamp: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException({
        status: "db-unavailable",
        timestamp: new Date().toISOString(),
      });
    }
  }
}
