import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get("health")
  health(): { status: string; uptime: number; timestamp: string } {
    return {
      status: "ok",
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
