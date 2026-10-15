import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { execFileSync, spawn } from "child_process";
import type { ChildProcess } from "child_process";
import { existsSync } from "fs";
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
  private readonly width: number;
  private readonly charset: CharacterSet;
  private readonly logoPath: string | null;
  private readonly qrTemplate: string | null;
  private readonly openDrawer: boolean;

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

    if (lower === "none" || lower === "simulado" || lower === "off") {
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

    this.width = Number(config.get("PRINTER_WIDTH") ?? 48);

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
    this.logoPath = logo ? (isAbsolute(logo) ? logo : resolve(process.cwd(), logo)) : null;

    const qr = (config.get<string>("PRINTER_QR_TEMPLATE") ?? "").trim();
    this.qrTemplate = qr || null;

    this.openDrawer = (config.get<string>("PRINTER_OPEN_DRAWER") ?? "false") === "true";

    this.logger.log(
      `Printer: ${this.winName ? `winspool -> ${this.winName}` : this.iface || "SIMULADO"} | ` +
        `charset=${this.charset} width=${this.width}` +
        (this.logoPath ? ` logo=${this.logoPath}` : "")
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

  private build(): ThermalPrinter {
    return new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: this.iface,
      characterSet: this.charset,
      width: this.width,
    });
  }

  /** Imprime el ticket del turno. */
  async printTurn(
    turn: TurnDTO,
    service: ServiceDTO,
    settings: SettingsDTO
  ): Promise<{ printed: boolean }> {
    if (!this.iface && !this.winName) {
      this.logger.log(`[SIMULADO] Ticket ${turn.code} (${service.name})`);
      return { printed: false };
    }

    let printer: ThermalPrinter;
    try {
      printer = this.build();
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

  /** Construye el contenido del ticket (similar al legacy Impresionwin.php). */
  private async fillTicket(
    printer: ThermalPrinter,
    turn: TurnDTO,
    service: ServiceDTO,
    settings: SettingsDTO
  ): Promise<void> {
    const header = service.printHeader || settings.ticketHeader || "";
    const footer = service.printFooter || settings.ticketFooter || "";

    printer.alignCenter();

    if (
      this.logoPath &&
      existsSync(this.logoPath) &&
      this.logoPath.toLowerCase().endsWith(".png")
    ) {
      try {
        await printer.printImage(this.logoPath);
      } catch (err) {
        this.logger.warn(
          `No se pudo imprimir el logo (${this.logoPath}): ${(err as Error).message}`
        );
      }
    }

    printer.setTextNormal();
    if (header) printer.println(header);
    printer.newLine();

    printer.setTextNormal();
    printer.println("TURNO");
    printer.setTextQuadArea();
    printer.bold(true);
    printer.println(turn.code);
    printer.bold(false);
    printer.setTextNormal();
    printer.newLine();

    printer.println(service.name);
    printer.drawLine();
    printer.println(new Date(turn.createdAt ?? Date.now()).toLocaleString("es-CO"));
    printer.newLine();

    if (this.qrTemplate) {
      const qr = this.qrTemplate
        .replace("{turno}", encodeURIComponent(turn.code))
        .replace("{servicio}", encodeURIComponent(service.name));
      try {
        printer.printQR(qr, { cellSize: 6, correction: "M", model: 2 });
        printer.newLine();
      } catch (err) {
        this.logger.warn(`No se pudo imprimir el QR: ${(err as Error).message}`);
      }
    }

    if (footer) printer.println(footer);
    printer.newLine();
    printer.newLine();
    printer.cut();
    if (this.openDrawer) printer.openCashDrawer();
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
