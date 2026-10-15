import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ApkConfig, ApkService } from "./apk.service";

@Controller("apk")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class ApkController {
  constructor(private readonly apk: ApkService) {}

  @Get()
  status() {
    return this.apk.status();
  }

  @Post("config")
  saveConfig(@Body() body: Partial<ApkConfig>) {
    this.apk.saveConfig({ url: body?.url ?? "", screen: body?.screen ?? "" });
    return this.apk.status();
  }

  @Post("build")
  build(@Body() body: Partial<ApkConfig>) {
    const cfg = { url: body?.url ?? "", screen: body?.screen ?? "" };
    const started = this.apk.build(cfg);
    if (!started) {
      return { ...this.apk.status(), alreadyBuilding: true };
    }
    return this.apk.status();
  }

  @Get("download")
  download(@Res() res: Response) {
    const path = this.apk.apkPath();
    if (!path) throw new NotFoundException("No hay un APK generado aun.");
    const st = this.apk.status();
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${st.fileName ?? "turnero.apk"}"`
    );
    res.sendFile(path);
  }
}
