import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "fs";
import { isAbsolute, join, resolve, delimiter } from "path";

export interface ApkConfig {
  url: string;
  screen: string;
}

export type ApkState = "idle" | "building" | "ready" | "error";

export interface ApkStatus {
  state: ApkState;
  message: string;
  config: ApkConfig;
  startedAt: string | null;
  finishedAt: string | null;
  sizeBytes: number | null;
  file: string | null;
  fileName: string | null;
  log: string[];
}

/**
 * Genera el APK de la pantalla (WebView que carga la URL del display).
 *
 * El proyecto Android vive en apps/display-android. El build inyecta la URL
 * en strings.xml (reemplazando los placeholders) y ejecuta `gradlew assembleDebug`.
 */
@Injectable()
export class ApkService implements OnModuleInit {
  private readonly logger = new Logger("Apk");
  private readonly projectDir: string;
  private readonly configFile: string;
  private readonly distDir: string;
  private readonly apkFile: string;

  private state: ApkState = "idle";
  private message = "";
  private startedAt: string | null = null;
  private finishedAt: string | null = null;
  private log: string[] = [];

  constructor() {
    // dist/apk -> dist -> api -> apps
    this.projectDir = resolve(__dirname, "..", "..", "..", "display-android");
    this.configFile = join(this.projectDir, "apk-config.json");
    this.distDir = join(this.projectDir, "dist");
    this.apkFile = join(this.distDir, "turnero.apk");
  }

  onModuleInit(): void {
    if (!existsSync(this.projectDir)) {
      this.logger.warn(`Proyecto Android no encontrado en ${this.projectDir}`);
    }
  }

  getConfig(): ApkConfig {
    try {
      if (existsSync(this.configFile)) {
        const raw = JSON.parse(readFileSync(this.configFile, "utf8")) as Partial<ApkConfig>;
        return { url: raw.url ?? "", screen: raw.screen ?? "" };
      }
    } catch (err) {
      this.logger.warn(`apk-config ilegible: ${(err as Error).message}`);
    }
    return { url: "", screen: "" };
  }

  saveConfig(cfg: ApkConfig): ApkConfig {
    const clean: ApkConfig = {
      url: (cfg.url ?? "").trim(),
      screen: (cfg.screen ?? "").trim(),
    };
    mkdirSync(this.projectDir, { recursive: true });
    writeFileSync(this.configFile, JSON.stringify(clean, null, 2), "utf8");
    return clean;
  }

  status(): ApkStatus {
    const cfg = this.getConfig();
    const ready = this.state === "ready" && existsSync(this.apkFile);
    return {
      state: this.state,
      message: this.message,
      config: cfg,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      sizeBytes: ready ? statSync(this.apkFile).size : null,
      file: ready ? this.apkFile : null,
      fileName: ready ? this.fileNameFor(cfg) : null,
      log: this.log.slice(-60),
    };
  }

  private fileNameFor(cfg: ApkConfig): string {
    const screen = cfg.screen.replace(/[^\w.-]+/g, "") || "pantalla";
    const d = new Date();
    const stamp =
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}` +
      `${String(d.getDate()).padStart(2, "0")}`;
    return `turnero-${screen}-${stamp}.apk`;
  }

  /** Devuelve la ruta del APK generado (o null si no existe). */
  apkPath(): string | null {
    return existsSync(this.apkFile) ? this.apkFile : null;
  }

  /** Lanza la construccion (asincrona). Devuelve falso si ya hay un build en curso. */
  build(config: ApkConfig): boolean {
    if (this.state === "building") return false;
    if (!existsSync(this.projectDir)) {
      this.state = "error";
      this.message = `Proyecto Android no encontrado: ${this.projectDir}`;
      return true;
    }

    this.saveConfig(config);
    this.state = "building";
    this.message = "Construyendo APK...";
    this.startedAt = new Date().toISOString();
    this.finishedAt = null;
    this.log = [`Inicio: url=${this.getConfig().url} pantalla=${this.getConfig().screen}`];

    void this.runBuild();
    return true;
  }

  private push(line: string): void {
    this.log.push(line);
    if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
  }

  private async runBuild(): Promise<void> {
    try {
      this.writeStringXml(this.getConfig());
      const javaHome = this.resolveJavaHome();
      const sdkDir = this.resolveSdkDir();

      if (!javaHome) throw new Error("No se encontro un JDK (>=17) para compilar el APK.");
      if (!sdkDir) throw new Error("No se encontro el Android SDK.");

      this.push(`JAVA_HOME=${javaHome}`);
      this.push(`ANDROID_HOME=${sdkDir}`);

      const gradlew = join(this.projectDir, process.platform === "win32" ? "gradlew.bat" : "gradlew");
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        JAVA_HOME: javaHome,
        ANDROID_HOME: sdkDir,
        ANDROID_SDK_ROOT: sdkDir,
        PATH: `${join(javaHome, "bin")}${delimiter}${process.env.PATH ?? ""}`,
      };

      await this.exec(gradlew, ["assembleDebug", "--console=plain"], this.projectDir, env);

      const out = join(
        this.projectDir,
        "app", "build", "outputs", "apk", "debug", "app-debug.apk"
      );
      if (!existsSync(out)) throw new Error("Gradle termino pero no genero el APK (app-debug.apk).");

      mkdirSync(this.distDir, { recursive: true });
      writeFileSync(this.apkFile, readFileSync(out));

      const size = statSync(this.apkFile).size;
      this.state = "ready";
      this.message = `APK generado (${Math.round(size / 1024)} KB).`;
      this.push(this.message);
      this.logger.log(this.message);
    } catch (err) {
      this.state = "error";
      this.message = (err as Error).message || "Error construyendo el APK.";
      this.push(`ERROR: ${this.message}`);
      this.logger.error(this.message);
    } finally {
      this.finishedAt = new Date().toISOString();
    }
  }

  private exec(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
    return new Promise((res, rej) => {
      // En Windows un .bat/.cmd debe invocarse a traves de cmd.exe (si no: spawn EINVAL).
      const isBatch = /\.(bat|cmd)$/i.test(cmd);
      const child =
        process.platform === "win32" && isBatch
          ? spawn(process.env.ComSpec || "cmd.exe", ["/c", cmd, ...args], {
              cwd,
              env,
              windowsHide: true,
              windowsVerbatimArguments: false,
            })
          : spawn(cmd, args, {
              cwd,
              env,
              windowsHide: true,
              shell: false,
            });

      let out = "";
      const onData = (chunk: Buffer) => {
        const text = chunk.toString();
        out += text;
        for (const line of text.split(/\r?\n/)) {
          if (line.trim()) this.push(line);
        }
        if (out.length > 60000) out = out.slice(-30000);
      };
      child.stdout?.on("data", onData);
      child.stderr?.on("data", onData);

      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          /* ignore */
        }
        rej(new Error("El build del APK supero el tiempo limite (15 min)."));
      }, 15 * 60 * 1000);

      child.on("error", (err) => {
        clearTimeout(timer);
        rej(err);
      });
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (code === 0) res();
        else rej(new Error(`gradlew termino con codigo ${code ?? "?"}.`));
      });
    });
  }

  /** Inyecta la URL y el id de pantalla en strings.xml. */
  private writeStringXml(cfg: ApkConfig): void {
    const url = escapeXml(cfg.url ?? "");
    const screen = escapeXml(cfg.screen ?? "");
    const xml =
      `<?xml version="1.0" encoding="utf-8"?>\n` +
      `<resources>\n` +
      `    <string name="app_name">Turnero</string>\n` +
      `    <string name="display_url">${url}</string>\n` +
      `    <string name="screen_id">${screen}</string>\n` +
      `</resources>\n`;
    const file = join(this.projectDir, "app", "src", "main", "res", "values", "strings.xml");
    writeFileSync(file, xml, "utf8");
    this.push(`strings.xml actualizado (url=${cfg.url || "VACIA"})`);
  }

  /** Encuentra un JDK >= 17 (Windows o Linux). */
  private resolveJavaHome(): string | null {
    const override = process.env.APK_JAVA_HOME;
    if (override && hasJavaBin(override)) return override;

    const candidates: string[] = [];
    const envHome = process.env.JAVA_HOME;
    if (envHome) candidates.push(envHome);
    const roots =
      process.platform === "win32"
        ? ["C:\\Program Files\\Java", "C:\\Program Files\\Eclipse Adoptium"]
        : ["/usr/lib/jvm", "/opt/java", "/opt/jdk"];
    for (const dir of roots) {
      try {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          if (e.isDirectory()) candidates.push(join(dir, e.name));
        }
      } catch {
        /* no existe */
      }
    }
    // Prefiere las versiones mas altas (jdk-20 > jdk-17 > jre-1.8).
    const rank = (p: string) => {
      const m = /(?:jdk|java)[-_]?(\d+)/i.exec(p);
      if (m) return 100 + parseInt(m[1], 10);
      return 0;
    };
    const valid = candidates
      .filter((p) => hasJavaBin(p) && /jdk|java/i.test(p))
      .sort((a, b) => rank(b) - rank(a));
    return valid[0] ?? null;
  }

  private resolveSdkDir(): string | null {
    const candidates = [
      process.env.APK_ANDROID_HOME,
      process.env.ANDROID_HOME,
      process.env.ANDROID_SDK_ROOT,
      join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk"),
      "C:\\Android\\Sdk",
    ].filter(Boolean) as string[];
    const found = candidates.find((p) => existsSync(p) && existsSync(join(p, "platform-tools")));
    return found ?? null;
  }
}

function hasJavaBin(dir: string): boolean {
  return existsSync(join(dir, "bin", process.platform === "win32" ? "java.exe" : "java"));
}

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
