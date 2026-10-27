import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, API_URL } from "../api";
import { Alert, Button, Card, Modal, PageHeader, errorMessage } from "./ui";

type VideoItem = {
  fileName: string;
  sizeBytes: number;
  modifiedAt: string;
};

type VideoList = {
  videos: VideoItem[];
  maxBytes: number;
};

const MEDIA_URL = API_URL.replace(/\/api\/?$/, "") + "/media";
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;

export function AdminVideos() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { data, isLoading, error } = useQuery<VideoList>({
    queryKey: ["media-videos"],
    queryFn: async () => (await api.get<VideoList>("/media/videos")).data,
    staleTime: 0,
  });

  const [selected, setSelected] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(
    null
  );
  const [deleting, setDeleting] = useState<VideoItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const videos = data?.videos ?? [];
  const maxBytes = data?.maxBytes ?? DEFAULT_MAX_BYTES;

  const chooseFiles = (files: FileList | null) => {
    setNotice(null);
    setProgress(0);
    const list = Array.from(files ?? []);
    const invalid = list.find((file) => !/\.mp4$/i.test(file.name));
    if (invalid) {
      setSelected([]);
      setNotice({ tone: "error", text: `"${invalid.name}" no es un video MP4.` });
      return;
    }
    const tooBig = list.find((file) => file.size > maxBytes);
    if (tooBig) {
      setSelected([]);
      setNotice({
        tone: "error",
        text: `"${tooBig.name}" supera el limite de ${formatBytes(maxBytes)}.`,
      });
      return;
    }
    setSelected(list);
  };

  const upload = async () => {
    if (!selected.length || uploading) return;

    setUploading(true);
    setProgress(0);
    setNotice(null);
    try {
      for (let index = 0; index < selected.length; index += 1) {
        const file = selected[index];
        const form = new FormData();
        form.append("file", file);
        await api.post("/media/videos", form, {
          timeout: 10 * 60 * 1000,
          onUploadProgress: (event) => {
            const total = event.total ?? file.size ?? 1;
            const current = total > 0 ? (event.loaded ?? 0) / total : 0;
            setProgress(Math.round(((index + current) / selected.length) * 100));
          },
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["media-videos"] });
      setNotice({
        tone: "success",
        text: `${selected.length} video(s) subido(s). La pantalla se actualizara automaticamente.`,
      });
      setSelected([]);
      setProgress(100);
      if (inputRef.current) inputRef.current.value = "";
    } catch (uploadError) {
      setNotice({
        tone: "error",
        text: errorMessage(uploadError, "No se pudieron subir los videos."),
      });
      await queryClient.invalidateQueries({ queryKey: ["media-videos"] });
    } finally {
      setUploading(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;

    setDeleteBusy(true);
    setNotice(null);
    try {
      await api.delete(`/media/videos/${encodeURIComponent(deleting.fileName)}`);
      await queryClient.invalidateQueries({ queryKey: ["media-videos"] });
      setNotice({
        tone: "success",
        text: "Video eliminado. La pantalla se actualizara automaticamente.",
      });
      setDeleting(null);
    } catch (deleteError) {
      setNotice({
        tone: "error",
        text: errorMessage(deleteError, "No se pudo eliminar el video."),
      });
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  const selectedBytes = selected.reduce((total, file) => total + file.size, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <PageHeader
        title="Videos de la pantalla"
        subtitle="Sube videos MP4 para que se reproduzcan en el visualizador del TV. Se muestran en bucle y en el orden de la lista."
      />

      <Card>
        <div className="space-y-4 p-6">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <label
              className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
                uploading
                  ? "cursor-not-allowed border-slate-200 bg-slate-50"
                  : "border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/40"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept="video/mp4,.mp4"
                multiple
                disabled={uploading}
                onChange={(event) => chooseFiles(event.target.files)}
                className="sr-only"
              />
              <span className="text-sm font-semibold text-slate-700">
                Seleccionar videos MP4
              </span>
              <span className="text-xs text-slate-500">
                Puedes elegir varios. Maximo {formatBytes(maxBytes)} por archivo.
              </span>
            </label>

            <Button
              onClick={upload}
              disabled={!selected.length || uploading}
              className="lg:self-center"
            >
              {uploading ? `Subiendo ${progress}%` : "Subir videos"}
            </Button>
          </div>

          {selected.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-700">
                {selected.length} archivo(s) seleccionado(s), {formatBytes(selectedBytes)}
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                {selected.map((file) => (
                  <li key={`${file.name}-${file.lastModified}`} className="truncate">
                    {file.name} - {formatBytes(file.size)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {uploading && (
            <div className="h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
          {error && (
            <Alert tone="error">
              {errorMessage(error, "No se pudo cargar la lista de videos.")}
            </Alert>
          )}
        </div>
      </Card>

      {isLoading ? (
        <p className="p-8 text-sm text-slate-500">Cargando videos...</p>
      ) : videos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm font-semibold text-slate-700">Todavia no hay videos.</p>
          <p className="mt-1 text-sm text-slate-500">
            Sube el primero y aparecera en la pantalla.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {videos.map((video, index) => (
            <Card key={video.fileName}>
              <video
                src={`${MEDIA_URL}/videos/${encodeURIComponent(video.fileName)}`}
                controls
                preload="metadata"
                className="aspect-video w-full bg-slate-950 object-contain"
              />
              <div className="space-y-3 p-4">
                <div>
                  <p className="flex items-start gap-2 text-sm font-semibold text-slate-800">
                    <span className="mt-0.5 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                      #{index + 1}
                    </span>
                    <span className="min-w-0 break-all" title={video.fileName}>
                      {video.fileName}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatBytes(video.sizeBytes)} -{" "}
                    {new Date(video.modifiedAt).toLocaleString("es-CO")}
                  </p>
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="danger"
                    disabled={uploading || deleteBusy}
                    onClick={() => {
                      setNotice(null);
                      setDeleting(video);
                    }}
                  >
                    Eliminar
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400">
        Formato recomendado: MP4 (H.264 + AAC). La pantalla actualiza la lista en cuanto
        subes o eliminas un video.
      </p>

      <Modal
        open={deleting !== null}
        title="Eliminar video"
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={deleteBusy} onClick={remove}>
              {deleteBusy ? "Eliminando..." : "Eliminar"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Seguro que deseas eliminar{" "}
          <strong className="break-all text-slate-800">{deleting?.fileName}</strong>? Dejara
          de mostrarse en la pantalla.
        </p>
      </Modal>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(0, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
