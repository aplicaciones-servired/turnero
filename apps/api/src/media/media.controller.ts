import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { TurnsGateway } from "../realtime/turns.gateway";
import { MediaService, UploadedVideoFile } from "./media.service";
import { MAX_VIDEO_BYTES } from "./video-files";

const UPLOAD_TMP = join(tmpdir(), "turnero-videos");
mkdirSync(UPLOAD_TMP, { recursive: true });

@Controller("media/videos")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
export class MediaController {
  constructor(
    private readonly media: MediaService,
    private readonly realtime: TurnsGateway
  ) {}

  @Get()
  list() {
    return this.media.list();
  }

  @Post()
  @UseInterceptors(
    FileInterceptor("file", {
      dest: UPLOAD_TMP,
      limits: { files: 1, fileSize: MAX_VIDEO_BYTES },
      fileFilter: (_req, file, callback) => {
        if (!/\.mp4$/i.test(file.originalname)) {
          callback(new BadRequestException("Solo se permiten videos MP4."), false);
          return;
        }
        callback(null, true);
      },
    })
  )
  async upload(@UploadedFile() file?: UploadedVideoFile) {
    const result = await this.media.upload(file);
    this.realtime.emitVideosUpdated();
    return result;
  }

  @Delete(":fileName")
  async remove(@Param("fileName") fileName: string) {
    const result = await this.media.remove(fileName);
    this.realtime.emitVideosUpdated();
    return result;
  }
}
