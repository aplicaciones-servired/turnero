import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { execFileSync, spawn } from "child_process";
import type { ChildProcess } from "child_process";
import { existsSync, readdirSync } from "fs";
import { isAbsolute, resolve } from "path";
import {
  CharacterSet,
  PrinterTypes,
  ThermalPrinter,
} from "node-thermal-printer";
import type { ServiceDTO, SettingsDTO, TurnDTO } from "@turnero/shared";

/**
 * Impresion de tickets.
 *
 * Formatos de PRINTER_INTERFACE soportados:
 *  - (vacio)                -> modo simulado (no imprime, solo loguea)
 *  - win:NombreImpresora    -> RAW a una impresora instalada en Windows (winspool)
 *  - tcp://IP:9100          -> impresora de red (node-thermal-printer)
 *  - printer:NombreCola     -> cola CUPS/Windows (requiere driver nativo)
 *  - /dev/usb/lp0 u otro    -> archivo/dispositivo (node-thermal-printer)
 */
@Injectable()
export class PrinterService {
  private readonly logger = new Logger("Printer");
  private readonly iface: string;
  private readonly winName: string | null;
  private readonly defaultWidth: number;
  private readonly charset: CharacterSet;
  private readonly envLogoPath: string | null;
  private readonly envQrTemplate: string | null;
  private readonly envOpenDrawer: boolean;
  /** Carpeta donde viven los logos imprimibles (public/media/imagenes). */
  private readonly logosDir: string;

  /**
   * Modo cola: el API no imprime, deja el ticket listo (ESC/POS en base64) para que
   * un agente que corre en la PC con la impresora lo recoja y lo imprima.
   * Se activa con PRINTER_INTERFACE=queue y evita que el servidor tenga que poder
   * conectar hacia la impresora (red corporativa que bloquea eso).
   */
  private readonly queueMode: boolean;
  /**
   * Modo kiosco (PRINTER_INTERFACE=kiosk): el API NO imprime; arma el ticket y lo
   * devuelve al kiosco para que este lo imprima en la impresora de SU PC, igual que
   * hacia el turnero master (el kiosco llamaba a Impresion.php en localhost).
   */
  private readonly kioskMode: boolean;
  /** Token compartido con el agente (PRINTER_AGENT_TOKEN). Sin el, la cola no se expone. */
  private readonly agentToken: string | null;
  private queue: Array<{ id: number; code: string; serviceName: string; b64: string }> = [];
  private queueSeq = 0;

  /** Worker PowerShell persistente para impresion RAW (evita recompilar/arrancar por ticket). */
  private worker: ChildProcess | null = null;
  private workerBuf = "";
  private workerSeq = 0;
  private readonly workerPending = new Map<
    number,
    { resolve: () => void; reject: (e: Error) => void }
  >();

  constructor(config: ConfigService) {
    const rawIface = (config.get<string>("PRINTER_INTERFACE") ?? "").trim();
    const lower = rawIface.toLowerCase();
    const explicitWin = lower.startsWith("win:") && lower !== "win:auto";
    this.queueMode = lower === "queue" || lower.startsWith("queue://");
    this.kioskMode = lower === "kiosk" || lower.startsWith("kiosk://");
    this.agentToken =
      (config.get<string>("PRINTER_AGENT_TOKEN") ?? "").trim() || null;

    if (this.queueMode || this.kioskMode) {
      this.winName = null;
      this.iface = "";
    } else if (lower === "none" || lower === "simulado" || lower === "off") {
      this.winName = null;
      this.iface = "";
    } else if (explicitWin) {
      this.winName = rawIface.slice(4).trim() || null;
      this.iface = "";
    } else if (lower === "" || lower === "auto" || lower === "win:auto") {
      this.winName = process.platform === "win32" ? this.detectWindowsPrinter() : null;
      this.iface = "";
      if (!this.winName) {
        this.logger.warn(
          "No se detecto impresora termica; se usara modo simulado (no imprime)."
        );
      }
    } else {
      this.winName = null;
      this.iface = rawIface;
    }

    this.defaultWidth = Number(config.get("PRINTER_WIDTH") ?? 48);
    this.logosDir = resolve(process.cwd(), "public/media/imagenes");

    const rawCharset = (config.get<string>("PRINTER_CHARACTER_SET") ?? "").trim();
    const valid = Object.values(CharacterSet) as string[];
    this.charset = (valid.includes(rawCharset)
      ? rawCharset
      : "PC850_MULTILINGUAL") as CharacterSet;
    if (rawCharset && !valid.includes(rawCharset)) {
      this.logger.warn(
        `PRINTER_CHARACTER_SET='${rawCharset}' no es valido; usando '${this.charset}'.`
      );
    }

    const logo = (config.get<string>("PRINTER_LOGO") ?? "").trim();
    this.envLogoPath = logo ? (isAbsolute(logo) ? logo : resolve(process.cwd(), logo)) : null;

    const qr = (config.get<string>("PRINTER_QR_TEMPLATE") ?? "").trim();
    this.envQrTemplate = qr || null;

    this.envOpenDrawer = (config.get<string>("PRINTER_OPEN_DRAWER") ?? "false") === "true";

    this.logger.log(
      `Printer: ${
        this.queueMode
          ? "COLA (lo imprime el agente remoto)"
          : this.kioskMode
            ? "KIOSCO (lo imprime el kiosco en su impresora local)"
            : this.winName
              ? `winspool -> ${this.winName}`
              : this.iface || "SIMULADO"
      } | ` +
        `charset=${this.charset} width=${this.defaultWidth}` +
        (this.envLogoPath ? ` logo=${this.envLogoPath}` : "")
    );

    // Precalienta el worker (compila el helper una sola vez).
    if (this.winName) this.ensureWorker();
  }

  /** Detecta automaticamente una impresora termica ESC/POS instalada en Windows. */
  private detectWindowsPrinter(): string | null {
    try {
      const ps =
        "Get-CimInstance Win32_Printer | Select-Object Name,DriverName,Default,WorkOffline,PrinterStatus | ConvertTo-Json -Compress";
      const out = execFileSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", ps],
        { encoding: "utf8", timeout: 15000, windowsHide: true }
      );
      const raw = out.trim();
      if (!raw) return null;

      let list: unknown = JSON.parse(raw);
      if (!Array.isArray(list)) list = [list];

      const virtual = /(onenote|xps|pdf|fax|send to|microsoft print)/i;
      const thermal = /(pos|thermal|t[eé]rmic|receipt|esc\/?pos|58mm|80mm|\b58\b|\b80\b)/i;

      const scored = (list as Array<Record<string, unknown>>)
        .filter(
          (p) =>
            p.Name &&
            !virtual.test(String(p.Name)) &&
            !virtual.test(String(p.DriverName ?? ""))
        )
        .map((p) => {
          let score = 0;
          if (thermal.test(String(p.Name)) || thermal.test(String(p.DriverName ?? ""))) score += 50;
          if (p.Default) score += 30;
          if (Number(p.PrinterStatus) === 3) score += 20;
          if (p.WorkOffline) score -= 100;
          return { name: String(p.Name), score };
        })
        .sort((a, b) => b.score - a.score);

      if (scored.length) {
        this.logger.log(`Impresora detectada: '${scored[0].name}' (score ${scored[0].score}).`);
        return scored[0].name;
      }
      return null;
    } catch (err) {
      this.logger.warn(`Deteccion de impresora fallo: ${(err as Error).message}`);
      return null;
    }
  }

  private build(width?: number): ThermalPrinter {
    return new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: this.iface,
      characterSet: this.charset,
      width: width && width > 0 ? width : this.defaultWidth,
    });
  }

  /** Resuelve la ruta del logo imprimible segun la config (o el de respaldo del .env). */
  private resolveLogo(settings: SettingsDTO): string | null {
    if (!settings.printLogo) return null;
    const file = (settings.printLogoFile ?? "").trim();
    if (file) {
      const p = isAbsolute(file) ? file : resolve(this.logosDir, file);
      if (existsSync(p) && p.toLowerCase().endsWith(".png")) return p;
    }
    return this.envLogoPath && existsSync(this.envLogoPath) ? this.envLogoPath : null;
  }

  /** URL del QR a partir de la plantilla ({turno} y {servicio}). */
  private buildQrUrl(settings: SettingsDTO, turn: TurnDTO, service: ServiceDTO): string | null {
    const template = (settings.printQrTemplate ?? "").trim() || this.envQrTemplate || "";
    if (!settings.printShowQr || !template) return null;
    return template
      .replace(/\{turno\}/g, encodeURIComponent(turn.code))
      .replace(/\{servicio\}/g, encodeURIComponent(service.name));
  }

  /** Escala de texto segun la opcion elegida (normal/double/triple/quad). */
  private applyTurnSize(printer: ThermalPrinter, size: string): void {
    const map: Record<string, number> = { normal: 0, double: 1, triple: 2, quad: 3 };
    const n = map[(size ?? "quad").toLowerCase()] ?? 3;
    printer.setTextSize(n, n);
  }

  /** Imprime el ticket del turno. En modo kiosco devuelve el ticket (base64) sin imprimir. */
  async printTurn(
    turn: TurnDTO,
    service: ServiceDTO,
    settings: SettingsDTO
  ): Promise<{ printed: boolean; ticket?: string }> {
    // ── Modo kiosco: se arma el ticket y lo imprime el propio kiosco (como el master) ──
    if (this.kioskMode) {
      try {
        const kiosco = this.build(settings.printWidth);
        await this.fillTicket(kiosco, turn, service, settings);
        const buffer = kiosco.getBuffer();
        if (!buffer || buffer.length === 0) throw new Error("buffer vacio");
        return { printed: false, ticket: buffer.toString("base64") };
      } catch (err) {
        this.logger.error(
          `Error preparando ticket ${turn.code} para el kiosco: ${(err as Error).message}`
        );
        return { printed: false };
      }
    }

    // ── Modo cola: se arma el ticket pero quien lo imprime es el agente remoto ──
    if (this.queueMode) {
      try {
        const cola = this.build(settings.printWidth);
        await this.fillTicket(cola, turn, service, settings);
        this.enqueue(turn, service, cola.getBuffer());
        return { printed: true };
      } catch (err) {
        this.logger.error(
          `Error encolando ticket ${turn.code}: ${(err as Error).message}`
        );
        return { printed: false };
      }
    }

    if (!this.iface && !this.winName) {
      this.logger.log(`[SIMULADO] Ticket ${turn.code} (${service.name})`);
      return { printed: false };
    }

    let printer: ThermalPrinter;
    try {
      printer = this.build(settings.printWidth);
      await this.fillTicket(printer, turn, service, settings);
    } catch (err) {
      this.logger.error(`Error preparando ticket ${turn.code}: ${(err as Error).message}`);
      return { printed: false };
    }

    // ── Windows RAW (winspool) ──
    if (this.winName) {
      try {
        const buffer = printer.getBuffer();
        if (!buffer || buffer.length === 0) throw new Error("buffer vacio");
        await this.sendWindowsRaw(this.winName, buffer);
        this.logger.log(`Ticket ${turn.code} impreso en '${this.winName}'.`);
        return { printed: true };
      } catch (err) {
        this.logger.error(`Error imprimiendo ticket ${turn.code}: ${(err as Error).message}`);
        return { printed: false };
      }
    }

    // ── node-thermal-printer (tcp / printer: / archivo) ──
    try {
      if (!(await printer.isPrinterConnected())) {
        this.logger.warn(
          `Impresora no conectada (${this.iface}). Ticket ${turn.code} no impreso.`
        );
        return { printed: false };
      }
      await printer.execute();
      this.logger.log(`Ticket ${turn.code} impreso (${this.iface}).`);
      return { printed: true };
    } catch (err) {
      this.logger.error(`Error imprimiendo ticket ${turn.code}: ${(err as Error).message}`);
      return { printed: false };
    }
  }

  // ── Cola de impresion (modo queue) ──

  private enqueue(turn: TurnDTO, service: ServiceDTO, buffer: Buffer): void {
    const job = {
      id: ++this.queueSeq,
      code: turn.code,
      serviceName: service.name,
      b64: buffer.toString("base64"),
    };
    this.queue.push(job);
    // Si el agente esta caido, no acumulamos para siempre.
    if (this.queue.length > 200) this.queue.shift();
    this.logger.log(
      `Ticket ${turn.code} encolado para el agente remoto (id ${job.id}).`
    );
  }

  /** Tickets pendientes que el agente debe imprimir. */
  listQueue(): Array<{ id: number; code: string; serviceName: string; b64: string }> {
    return this.queue.slice();
  }

  /** El agente confirma que ya imprimio el ticket; lo saca de la cola. */
  ack(id: number): boolean {
    const i = this.queue.findIndex((j) => j.id === id);
    if (i < 0) return false;
    const [job] = this.queue.splice(i, 1);
    this.logger.log(`Ticket ${job.code} (id ${id}) confirmado por el agente.`);
    return true;
  }

  /** Token que el agente debe enviar en la cabecera Authorization. */
  getAgentToken(): string | null {
    return this.agentToken;
  }

  /** Construye el contenido del ticket (similar al legacy Impresionwin.php). */
  private async fillTicket(
    printer: ThermalPrinter,
    turn: TurnDTO,
    service: ServiceDTO,
    settings: SettingsDTO
  ): Promise<void> {
    const header = (service.printHeader || "").trim() || settings.ticketHeader || "";
    const footer = (service.printFooter || "").trim() || settings.ticketFooter || "";

    printer.alignCenter();

    const logo = this.resolveLogo(settings);
    if (logo) {
      try {
        await printer.printImage(logo);
      } catch (err) {
        this.logger.warn(`No se pudo imprimir el logo (${logo}): ${(err as Error).message}`);
      }
    }

    printer.setTextNormal();
    if (settings.printShowHeader && header) printer.println(header);
    if (settings.printShowHeader && header) printer.newLine();

    printer.setTextNormal();
    printer.println("TURNO");
    this.applyTurnSize(printer, settings.printTurnSize);
    printer.bold(true);
    printer.println(turn.code);
    printer.bold(false);
    printer.setTextNormal();
    printer.newLine();

    if (settings.printShowService) printer.println(service.name);
    if (settings.printShowService || settings.printShowDate) printer.drawLine();
    if (settings.printShowDate) {
      printer.println(new Date(turn.createdAt ?? Date.now()).toLocaleString("es-CO"));
    }
    printer.newLine();

    const qr = this.buildQrUrl(settings, turn, service);
    if (qr) {
      try {
        printer.printQR(qr, { cellSize: 6, correction: "M", model: 2 });
        printer.newLine();
      } catch (err) {
        this.logger.warn(`No se pudo imprimir el QR: ${(err as Error).message}`);
      }
    }

    if (settings.printShowFooter && footer) printer.println(footer);
    for (let i = 0; i < Math.max(0, settings.printFeed ?? 2); i++) printer.newLine();
    if (settings.printCut) printer.cut();
    if (settings.printOpenDrawer || this.envOpenDrawer) printer.openCashDrawer();
  }

  /** Lista los logos PNG disponibles en public/media/imagenes. */
  listLogos(): string[] {
    try {
      if (!existsSync(this.logosDir)) return [];
      return readdirSync(this.logosDir)
        .filter((f) => f.toLowerCase().endsWith(".png"))
        .sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  }

  /** Informacion de la impresora para el panel de admin.
   *  `connected` es una comprobacion REAL (no solo que exista la configuracion):
   *  para tcp:// abre y cierra un socket, para /dev/... revisa que el fichero exista.
   */
  async getInfo(): Promise<{
    connected: boolean;
    printerName: string | null;
    interface: string;
    width: number;
    mode: string;
    logos: string[];
    qrTemplate: string;
    openDrawer: boolean;
  }> {
    let connected = false;
    if (this.queueMode) {
      // El agente se encarga; el API solo mantiene la cola.
      connected = true;
    } else if (this.kioskMode) {
      // El kiosco imprime en su propia impresora; el API no puede sondearla.
      connected = true;
    } else if (this.winName) {
      // Windows: la impresora se detecto al arrancar; winspool no permite sondear sin imprimir.
      connected = true;
    } else if (this.iface) {
      try {
        connected = await this.build().isPrinterConnected();
      } catch {
        connected = false;
      }
    }

    return {
      connected,
      printerName: this.winName,
      interface: this.winName
        ? `win:${this.winName}`
        : this.queueMode
          ? "queue (agente remoto)"
          : this.kioskMode
            ? "kiosk (impresora del kiosco)"
            : this.iface || "simulado",
      width: this.defaultWidth,
      mode: this.winName
        ? "winspool"
        : this.queueMode
          ? "queue"
          : this.kioskMode
            ? "kiosk"
            : this.iface
              ? "interface"
              : "simulado",
      logos: this.listLogos(),
      qrTemplate: this.envQrTemplate ?? "",
      openDrawer: this.envOpenDrawer,
    };
  }

  /** Genera una previsualizacion de texto (ancho en columnas) del ticket. */
  preview(turn: TurnDTO, service: ServiceDTO, settings: SettingsDTO): { width: number; lines: string[] } {
    const width = settings.printWidth && settings.printWidth > 0 ? settings.printWidth : this.defaultWidth;
    const lines: string[] = [];
    const header = (service.printHeader || "").trim() || settings.ticketHeader || "";
    const footer = (service.printFooter || "").trim() || settings.ticketFooter || "";
    const center = (t: string) => {
      const s = String(t ?? "");
      if (s.length >= width) return s;
      const pad = Math.floor((width - s.length) / 2);
      return " ".repeat(pad) + s;
    };

    if (settings.printLogo) {
      const file = (settings.printLogoFile ?? "").trim() || "logoTiket.png";
      lines.push(center(`[ LOGO: ${file} ]`));
    }
    if (settings.printShowHeader && header) {
      lines.push(...header.split("\n").map((l) => center(l)));
    }
    lines.push(center("TURNO"));
    lines.push(center(turn.code));
    lines.push("");
    if (settings.printShowService) lines.push(center(service.name));
    if (settings.printShowService || settings.printShowDate) lines.push("-".repeat(width));
    if (settings.printShowDate) {
      lines.push(center(new Date(turn.createdAt ?? Date.now()).toLocaleString("es-CO")));
    }
    lines.push("");
    const qr = this.buildQrUrl(settings, turn, service);
    if (qr) {
      lines.push(center("[ QR ]"));
      for (let i = 0; i < qr.length; i += width) lines.push(qr.slice(i, i + width));
    }
    if (settings.printShowFooter && footer) {
      lines.push(...footer.split("\n").map((l) => center(l)));
    }
    for (let i = 0; i < Math.max(0, settings.printFeed ?? 2); i++) lines.push("");
    if (settings.printCut) lines.push(center("✂ - - - - - - - - - - - - -"));
    if (settings.printOpenDrawer || this.envOpenDrawer) lines.push(center("[ ABRIR CAJON ]"));

    return { width, lines };
  }

  /** Imprime un ticket de prueba con datos ficticios. */
  async printSample(
    settings: SettingsDTO,
    serviceName = "Servicio de prueba",
    turnCode = "A-000"
  ): Promise<{ printed: boolean }> {
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
    const now = new Date().toISOString();
    const turn: TurnDTO = {
      id: "0",
      number: 0,
      code: turnCode,
      status: "waiting",
      serviceId: "0",
      serviceName,
      servicePrefix: "A",
      counterId: null,
      counterName: null,
      createdAt: now,
      calledAt: null,
      finishedAt: null,
    };
    return this.printTurn(turn, service, settings);
  }

  /** Crea (si hace falta) el worker PowerShell persistente que compila el helper UNA vez. */
  private ensureWorker(): void {
    if (this.worker && this.worker.exitCode === null && !this.worker.killed) return;

    const encoded = Buffer.from(WINDOWS_RAW_PS, "utf16le").toString("base64");
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encoded,
      ],
      { windowsHide: true }
    );
    this.worker = child;
    this.workerBuf = "";

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      this.workerBuf += chunk;
      let idx: number;
      while ((idx = this.workerBuf.indexOf("\n")) >= 0) {
        const line = this.workerBuf.slice(0, idx).trim();
        this.workerBuf = this.workerBuf.slice(idx + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line) as { id: number; ok: boolean; err?: string };
          const pending = this.workerPending.get(msg.id);
          if (pending) {
            this.workerPending.delete(msg.id);
            if (msg.ok) pending.resolve();
            else pending.reject(new Error(msg.err || "winspool"));
          }
        } catch {
          /* ruido de PowerShell: ignorar */
        }
      }
    });
    child.stderr?.on("data", (d) => {
      const text = d.toString().trim();
      if (text) this.logger.warn(`printer worker: ${text}`);
    });

    const failAll = (reason: string) => {
      if (this.worker !== child) return;
      for (const [, p] of this.workerPending) p.reject(new Error(reason));
      this.workerPending.clear();
      this.worker = null;
    };
    child.on("exit", () => failAll("worker de impresion finalizado"));
    child.on("error", (err) => failAll(`worker de impresion: ${err.message}`));
  }

  /** Envia el buffer ESC/POS como trabajo RAW a una impresora de Windows (via worker). */
  private sendWindowsRaw(printerName: string, buffer: Buffer): Promise<void> {
    if (process.platform !== "win32") {
      return Promise.reject(new Error("win: solo soportado en Windows"));
    }
    this.ensureWorker();
    const worker = this.worker;
    if (!worker || !worker.stdin) {
      return Promise.reject(new Error("worker de impresion no disponible"));
    }

    const id = ++this.workerSeq;
    return new Promise<void>((resolvePromise, rejectPromise) => {
      const timer = setTimeout(() => {
        this.workerPending.delete(id);
        rejectPromise(new Error("timeout enviando a la impresora"));
      }, 15000);

      this.workerPending.set(id, {
        resolve: () => {
          clearTimeout(timer);
          resolvePromise();
        },
        reject: (e) => {
          clearTimeout(timer);
          rejectPromise(e);
        },
      });

      const payload = JSON.stringify({ id, printer: printerName, b64: buffer.toString("base64") });
      worker.stdin!.write(payload + "\n");
    });
  }
}

/** Script PowerShell que imprime bytes RAW en una impresora de Windows (winspool). */
const WINDOWS_RAW_PS = `
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'
$code = @'
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
  public static bool SendBytesToPrinter(string szPrinterName, byte[] bytes) {
    IntPtr hPrinter = IntPtr.Zero;
    DOCINFOA di = new DOCINFOA();
    bool bSuccess = false;
    di.pDocName = "Turnero Ticket";
    di.pDataType = "RAW";
    if (OpenPrinter(szPrinterName.Normalize(), out hPrinter, IntPtr.Zero)) {
      if (StartDocPrinter(hPrinter, 1, di)) {
        if (StartPagePrinter(hPrinter)) {
          IntPtr pBytes = Marshal.AllocCoTaskMem(bytes.Length);
          Marshal.Copy(bytes, 0, pBytes, bytes.Length);
          Int32 dwWritten = 0;
          bSuccess = WritePrinter(hPrinter, pBytes, bytes.Length, out dwWritten);
          Marshal.FreeCoTaskMem(pBytes);
          EndPagePrinter(hPrinter);
        }
        EndDocPrinter(hPrinter);
      }
      ClosePrinter(hPrinter);
    }
    if (bSuccess == false) { Console.Error.WriteLine("winspool error: " + Marshal.GetLastWin32Error()); }
    return bSuccess;
  }
}
'@
Add-Type -TypeDefinition $code

# Listo para recibir trabajos.
[Console]::Out.WriteLine('{"id":0,"ok":true,"ready":true}')
[Console]::Out.Flush()

$in = [Console]::In
while ($null -ne ($line = $in.ReadLine())) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  $id = 0; $ok = $false; $err = ''
  try {
    $msg = $line | ConvertFrom-Json
    $id = [int]$msg.id
    $bytes = [Convert]::FromBase64String([string]$msg.b64)
    $ok = [RawPrinterHelper]::SendBytesToPrinter([string]$msg.printer, $bytes)
    if (-not $ok) { $err = 'winspool error' }
  } catch {
    $err = $_.Exception.Message
  }
  $safe = ($err -replace '"', '\"') -replace '[\r\n]', ' '
  if ($ok) {
    $resp = '{"id":' + $id + ',"ok":true}'
  } else {
    $resp = '{"id":' + $id + ',"ok":false,"err":"' + $safe + '"}'
  }
  [Console]::Out.WriteLine($resp)
  [Console]::Out.Flush()
}
`;
