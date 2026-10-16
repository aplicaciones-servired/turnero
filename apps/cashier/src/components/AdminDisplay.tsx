import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { api, API_URL, TOKEN_KEY } from "../api";

type ApkState = "idle" | "building" | "ready" | "error";

type ApkStatus = {
  state: ApkState;
  message: string;
  config: { url: string; screen: string };
  startedAt: string | null;
  finishedAt: string | null;
  sizeBytes: number | null;
  file: string | null;
  fileName: string | null;
  log: string[];
};

export function AdminDisplay() {
  const { data, refetch, isFetching } = useQuery<ApkStatus>({
    queryKey: ["apk"],
    queryFn: async () => (await api.get<ApkStatus>("/apk")).data,
    staleTime: 0,
  });

  const [url, setUrl] = useState("");
  const [screen, setScreen] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data?.config && !loaded) {
      setUrl(data.config.url);
      setScreen(data.config.screen);
      setLoaded(true);
    }
  }, [data, loaded]);

  // Consulta el estado cada 2 s mientras se construye.
  useEffect(() => {
    if (data?.state !== "building") return;
    const id = window.setInterval(() => void refetch(), 2000);
    return () => window.clearInterval(id);
  }, [data?.state, refetch]);

  const startBuild = async () => {
    if (!url.trim()) {
      setError("Escribe la URL del display antes de generar el APK.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post("/apk/build", { url: url.trim(), screen: screen.trim() });
      await refetch();
    } catch (e) {
      setError(
        axios.isAxiosError<{ message?: string | string[] }>(e)
          ? String(e.response?.data?.message ?? "No se pudo iniciar el build.")
          : "No se pudo iniciar el build."
      );
    } finally {
      setBusy(false);
    }
  };

  const saveConfig = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post("/apk/config", { url: url.trim(), screen: screen.trim() });
      await refetch();
    } catch (e) {
      setError(
        axios.isAxiosError<{ message?: string | string[] }>(e)
          ? String(e.response?.data?.message ?? "No se pudo guardar la configuración.")
          : "No se pudo guardar la configuración."
      );
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!data?.fileName) {
      setError("Todavia no hay un APK generado. Pulsa \"Generar APK\" primero.");
      return;
    }
    setError(null);
    // Descarga nativa del navegador: evita depender de axios/blobs y funciona
    // al primer clic. El token viaja como parametro porque un enlace no puede
    // enviar la cabecera Authorization.
    const token = localStorage.getItem(TOKEN_KEY);
    const base = API_URL.replace(/\/+$/, "");
    const href = `${base}/apk/download${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    const a = document.createElement("a");
    a.href = href;
    a.download = data.fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const state = data?.state ?? "idle";
  const building = state === "building";

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h2 className="text-lg font-semibold text-slate-800">Pantalla (APK)</h2>
      <p className="mt-1 text-sm text-slate-500">
        Genera una APK de la pantalla (navegador WebView) con la URL del display ya
        configurada. El TV necesita internet para cargar la página.
      </p>

      <section className="mt-5 space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">
              URL del display
            </label>
            <input
              className="input"
              placeholder="http://192.168.1.10:5175/"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={building}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">
              Pantalla (id)
            </label>
            <input
              className="input"
              placeholder="1"
              value={screen}
              onChange={(e) => setScreen(e.target.value)}
              disabled={building}
            />
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Ej.: <code>http://192.168.1.10:5175/</code> — el id de pantalla agrega{" "}
          <code>?screen=N</code> si lo dejas vacio.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={startBuild}
            disabled={busy || building}
            className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {building ? "Construyendo..." : "Generar APK"}
          </button>
          <button
            onClick={saveConfig}
            disabled={busy || building}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Guardar URL
          </button>
          <button
            onClick={download}
            disabled={!data?.fileName}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            Descargar APK
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Estado:
            </span>
            <StateBadge state={state} />
            {isFetching && state !== "building" && (
              <span className="text-xs text-slate-400">consultando...</span>
            )}
          </div>
          {data?.message && <p className="mt-1 text-slate-600">{data.message}</p>}
          <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
            {data?.startedAt && (
              <li>Inicio: {new Date(data.startedAt).toLocaleString("es-CO")}</li>
            )}
            {data?.finishedAt && <li>Fin: {new Date(data.finishedAt).toLocaleString("es-CO")}</li>}
            {data?.sizeBytes ? (
              <li>Tamano: {(data.sizeBytes / 1024).toFixed(0)} KB</li>
            ) : null}
            {data?.fileName && <li>Archivo: {data.fileName}</li>}
          </ul>
        </div>

        {data?.log?.length ? (
          <details className="rounded-xl border border-slate-200 bg-slate-950 p-3" open={building}>
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-400">
              Log del build
            </summary>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-4 text-slate-200">
              {data.log.join("\n")}
            </pre>
          </details>
        ) : null}

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
          <p className="font-semibold">Como instalar</p>
          <ol className="mt-1 list-decimal space-y-1 pl-5">
            <li>Descarga el APK y copialo al TV/Android (USB, correo o red).</li>
            <li>
              En Android: habilita <em>Origenes desconocidos</em> y abre el archivo para
              instalar.
            </li>
            <li>Abre la app "Turnero" — cargara la URL del display en pantalla completa.</li>
          </ol>
        </div>
      </section>
    </div>
  );
}

function StateBadge({ state }: { state: ApkState }) {
  const map: Record<ApkState, { label: string; cls: string }> = {
    idle: { label: "Sin generar", cls: "bg-slate-200 text-slate-700" },
    building: { label: "Construyendo", cls: "bg-blue-100 text-blue-700" },
    ready: { label: "Listo para descargar", cls: "bg-emerald-100 text-emerald-700" },
    error: { label: "Error", cls: "bg-red-100 text-red-700" },
  };
  const it = map[state];
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${it.cls}`}>
      {it.label}
    </span>
  );
}
