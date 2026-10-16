import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import type { ServiceDTO, SettingsDTO, TurnDTO } from "@turnero/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { SettingsService } from "../settings/settings.service";
import { PrinterService } from "./printer.service";

interface PrinterSampleBody {
  settings?: Partial<SettingsDTO>;
  turnCode?: string;
  serviceName?: string;
}

/**
 * Valores por defecto del ticket. Permite generar una vista previa/prueba
 * sin tocar la base de datos (el cliente envia el borrador completo).
 */
const DEFAULT_SETTINGS: SettingsDTO = {
  businessName: "Mi Empresa",
  ticketHeader: "",
  ticketFooter: "",
  announcePrefix: "Turno",
  voiceRate: 0.85,
  voicePitch: 1,
  marquee: "",
  logo: null,
  voiceVolume: 10,
  printWidth: 48,
  printLogo: true,
  printLogoFile: "logoTiket.png",
  printShowHeader: true,
  printShowService: true,
  printShowDate: true,
  printShowQr: false,
  printQrTemplate: "",
  printShowFooter: true,
  printTurnSize: "quad",
  printFeed: 2,
  printCut: true,
  printOpenDrawer: false,
};

@Controller("printer")
export class PrinterController {
  constructor(
    private readonly printer: PrinterService,
    private readonly settings: SettingsService
  ) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get()
  async info() {
    return this.printer.getInfo();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post("preview")
  async preview(@Body() body: PrinterSampleBody) {
    const { settings, turn, service } = await this.buildSample(body);
    return this.printer.preview(turn, service, settings);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Post("test")
  async test(@Body() body: PrinterSampleBody) {
    const { settings, turn, service } = await this.buildSample(body);
    return this.printer.printSample(settings, service.name, turn.code);
  }

  private async buildSample(body: PrinterSampleBody): Promise<{
    settings: SettingsDTO;
    turn: TurnDTO;
    service: ServiceDTO;
  }> {
    const settings: SettingsDTO = body?.settings
      ? ({ ...DEFAULT_SETTINGS, ...body.settings } as SettingsDTO)
      : await this.settings.get();
    const serviceName = body?.serviceName?.trim() || "Servicio de prueba";
    const service: ServiceDTO = {
      id: "0",
      name: serviceName,
      prefix: "A",
      active: true,
      order: 1,
      color: "#000000",
      printHeader: null,
      printFooter: null,
    };
    const turn: TurnDTO = {
      id: "0",
      number: 0,
      code: body?.turnCode?.trim() || "A-001",
      status: "waiting",
      serviceId: "0",
      serviceName,
      servicePrefix: "A",
      counterId: null,
      counterName: null,
      createdAt: new Date().toISOString(),
      calledAt: null,
      finishedAt: null,
    };
    return { settings, turn, service };
  }
}
