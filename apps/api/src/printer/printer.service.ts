import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { spawn } from "child_process";
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

  constructor(config: ConfigService) {
    const rawIface = (config.get<string>("PRINTER_INTERFACE") ?? "").trim();
    if (rawIface.toLowerCase().startsWith("win:")) {
      this.winName = rawIface.slice(4).trim() || null;
      this.iface = "";
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
    if (settings.businessName) {
      printer.bold(true);
      printer.println(settings.businessName);
      printer.bold(false);
    }
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

  /** Envia el buffer ESC/POS como trabajo RAW a una impresora de Windows. */
  private sendWindowsRaw(printerName: string, buffer: Buffer): Promise<void> {
    return new Promise((resolvePromise, rejectPromise) => {
      if (process.platform !== "win32") {
        rejectPromise(new Error("win: solo soportado en Windows"));
        return;
      }

      const encoded = Buffer.from(WINDOWS_RAW_PS, "utf16le").toString("base64");
      const b64 = buffer.toString("base64");

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
        {
          windowsHide: true,
          env: { ...process.env, TURNERO_PRINTER_NAME: printerName, TURNERO_PRINTER_B64: b64 },
        }
      );

      let stderr = "";
      let stdout = "";
      const timer = setTimeout(() => {
        child.kill();
        rejectPromise(new Error("timeout enviando a la impresora"));
      }, 15000);

      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("error", (err) => {
        clearTimeout(timer);
        rejectPromise(err);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolvePromise();
        else rejectPromise(new Error(stderr.trim() || stdout.trim() || `powershell exit ${code}`));
      });

      child.stdin.write(b64);
      child.stdin.end();
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
$name = $env:TURNERO_PRINTER_NAME
if ([string]::IsNullOrWhiteSpace($name)) { Console.Error.WriteLine("Falta TURNERO_PRINTER_NAME"); exit 2 }
$b64 = $env:TURNERO_PRINTER_B64
if ([string]::IsNullOrWhiteSpace($b64)) { $b64 = [Console]::In.ReadToEnd() }
if ([string]::IsNullOrWhiteSpace($b64)) { Console.Error.WriteLine("Sin datos"); exit 3 }
$bytes = [Convert]::FromBase64String($b64.Trim())
$ok = [RawPrinterHelper]::SendBytesToPrinter($name, $bytes)
if ($ok) { Write-Output "OK $($bytes.Length) bytes -> $name" } else { Console.Error.WriteLine("FALLO al enviar a $name"); exit 1 }
`;
