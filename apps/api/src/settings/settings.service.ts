import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/sequelize";
import { ConfigService } from "@nestjs/config";
import type { SettingsDTO } from "@turnero/shared";
import { Setting } from "../models/setting.model";
import { Configtv } from "../models/configtv.model";
import { Datosempresa } from "../models/datosempresa.model";
import { UpdateSettingsDto } from "./dto/update-settings.dto";

@Injectable()
export class SettingsService {
  /** Cache corta: el kiosco pide un turno por vez y no hace falta releer la
   *  configuracion (3 consultas) en cada ticket. `update()` la refresca. */
  private static readonly TTL_MS = 10_000;
  private cached: { at: number; value: SettingsDTO } | null = null;

  constructor(
    @InjectModel(Setting) private readonly model: typeof Setting,
    @InjectModel(Configtv) private readonly configModel: typeof Configtv,
    @InjectModel(Datosempresa) private readonly empresaModel: typeof Datosempresa,
    private readonly config: ConfigService
  ) {}

  async get(): Promise<SettingsDTO> {
    if (this.cached && Date.now() - this.cached.at < SettingsService.TTL_MS) {
      return this.cached.value;
    }
    const [row] = await this.model.findOrCreate({ where: { id: 1 } });
    const dto = await this.toDto(row);
    this.cached = { at: Date.now(), value: dto };
    return dto;
  }

  async update(dto: UpdateSettingsDto): Promise<SettingsDTO> {
    const [row] = await this.model.findOrCreate({ where: { id: 1 } });
    const { marquee, voiceVolume, ...settingFields } = dto;
    Object.assign(row, settingFields);
    await row.save();

    if (marquee !== undefined || voiceVolume !== undefined) {
      // Mensaje y volumen son globales: se guardan en todas las filas de
      // configtv para que cualquier pantalla (estado 1, 2, 3, 4...) los lea.
      const configs = await this.configModel.findAll();
      for (const config of configs) {
        if (marquee !== undefined) config.mensaje = marquee;
        if (voiceVolume !== undefined) config.VolumenVoz = voiceVolume;
        await config.save();
      }
    }

    const resultado = await this.toDto(row);
    this.cached = { at: Date.now(), value: resultado };
    return resultado;
  }

  private get sedeId(): number | null {
    const raw = this.config.get<string>("SEDE_ID");
    return raw ? Number(raw) : null;
  }

  private async toDto(s: Setting): Promise<SettingsDTO> {
    const sedeId = this.sedeId;
    const config = sedeId !== null
      ? await this.configModel.findOne({ where: { IdSede: sedeId } })
      : await this.configModel.findOne();
    const empresa = await this.empresaModel.findOne();

    return {
      businessName: empresa?.NombreEmpresa ?? s.businessName,
      ticketHeader: s.ticketHeader,
      ticketFooter: s.ticketFooter,
      announcePrefix: s.announcePrefix,
      voiceRate: s.voiceRate,
      voicePitch: s.voicePitch,
      marquee: config?.mensaje ?? "",
      logo: config?.nombreLogo ?? null,
      voiceVolume: config?.VolumenVoz ?? 10,
      printWidth: s.printWidth ?? 48,
      printLogo: Boolean(s.printLogo),
      printLogoFile: s.printLogoFile ?? "logoTiket.png",
      printShowHeader: Boolean(s.printShowHeader),
      printShowService: Boolean(s.printShowService),
      printShowDate: Boolean(s.printShowDate),
      printShowQr: Boolean(s.printShowQr),
      printQrTemplate: s.printQrTemplate ?? "",
      printShowFooter: Boolean(s.printShowFooter),
      printTurnSize: s.printTurnSize ?? "quad",
      printFeed: s.printFeed ?? 2,
      printCut: Boolean(s.printCut),
      printOpenDrawer: Boolean(s.printOpenDrawer),
    };
  }
}
