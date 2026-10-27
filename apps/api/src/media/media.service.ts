import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { unlink } from "node:fs/promises";
import {
  deleteVideoFile,
  listVideoFiles,
  MAX_VIDEO_BYTES,
  saveUploadedVideo,
} from "./video-files";

export interface UploadedVideoFile {
  originalname: string;
  mimetype: string;
  size: number;
  path: string;
}

@Injectable()
export class MediaService {
  async list() {
    return {
      videos: await listVideoFiles(),
      maxBytes: MAX_VIDEO_BYTES,
    };
  }

  async upload(file?: UploadedVideoFile) {
    if (!file) {
      throw new BadRequestException("Selecciona un video MP4.");
    }

    if (!/\.mp4$/i.test(file.originalname)) {
      await unlink(file.path).catch(() => undefined);
      throw new BadRequestException("Solo se permiten videos MP4.");
    }

    if (!file.size) {
      await unlink(file.path).catch(() => undefined);
      throw new BadRequestException("El video esta vacio.");
    }

    try {
      await saveUploadedVideo(file.path, file.originalname);
    } catch {
      await unlink(file.path).catch(() => undefined);
      throw new BadRequestException("No se pudo guardar el video.");
    }

    return this.list();
  }

  async remove(fileName: string) {
    try {
      await deleteVideoFile(fileName);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new NotFoundException("El video no existe.");
      }
      if (error instanceof Error && error.message === "Nombre de video invalido") {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    return this.list();
  }
}
