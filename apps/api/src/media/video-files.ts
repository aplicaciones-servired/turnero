import { constants } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  readdir,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import { basename, extname, join } from "node:path";

export const VIDEOS_DIR = join(__dirname, "..", "..", "public", "media", "videos");
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

export interface VideoFile {
  fileName: string;
  sizeBytes: number;
  modifiedAt: string;
}

export async function ensureVideosDir(): Promise<void> {
  await mkdir(VIDEOS_DIR, { recursive: true });
}

export async function listVideoFiles(): Promise<VideoFile[]> {
  await ensureVideosDir();
  const entries = await readdir(VIDEOS_DIR, { withFileTypes: true });
  const videos = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && /\.mp4$/i.test(entry.name))
      .map(async (entry) => {
        const info = await stat(join(VIDEOS_DIR, entry.name));
        return {
          fileName: entry.name,
          sizeBytes: info.size,
          modifiedAt: info.mtime.toISOString(),
          mtimeMs: info.mtimeMs,
        };
      })
  );

  return videos
    .sort((a, b) => a.mtimeMs - b.mtimeMs || a.fileName.localeCompare(b.fileName))
    .map(({ mtimeMs: _mtimeMs, ...video }) => video);
}

export async function saveUploadedVideo(
  tempPath: string,
  originalName: string
): Promise<string> {
  await ensureVideosDir();
  const target = await uniqueVideoPath(sanitizeVideoFileName(originalName));

  try {
    await rename(tempPath, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
    try {
      await copyFile(tempPath, target);
    } catch (copyError) {
      await unlink(target).catch(() => undefined);
      throw copyError;
    }
    await unlink(tempPath).catch(() => undefined);
  }

  return basename(target);
}

export async function deleteVideoFile(fileName: string): Promise<void> {
  const safe = basename(fileName);
  if (safe !== fileName || !/\.mp4$/i.test(safe)) {
    throw new Error("Nombre de video invalido");
  }
  await unlink(join(VIDEOS_DIR, safe));
}

function sanitizeVideoFileName(originalName: string): string {
  const extension = extname(basename(originalName)).toLowerCase();
  if (extension !== ".mp4") {
    throw new Error("Formato no permitido");
  }

  const base = basename(originalName, extname(originalName))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);

  return `${base || "video"}.mp4`;
}

async function uniqueVideoPath(fileName: string): Promise<string> {
  const extension = extname(fileName);
  const base = basename(fileName, extension);
  let candidate = join(VIDEOS_DIR, fileName);
  let suffix = 2;

  while (await exists(candidate)) {
    candidate = join(VIDEOS_DIR, `${base}-${suffix}${extension}`);
    suffix += 1;
  }

  return candidate;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
