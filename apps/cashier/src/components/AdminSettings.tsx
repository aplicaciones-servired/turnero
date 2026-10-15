import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import type { ServiceDTO, SettingsDTO } from "@turnero/shared";
import { api } from "../api";

type PrinterInfo = {
  connected: boolean;
  printerName: string | null;
  interface: string;
  width: number;
  mode: string;
  logos: string[];
  qrTemplate: string;
  openDrawer: boolean;
};

type Preview = { width: number; lines: string[] };

/** Valores de respaldo si la API no devuelve un campo de impresion. */
const PRINT_DEFAULTS = {
  printWidth: 48,
  printLogo: true,
  printLogoFile: "logoTiket.png",
  printShowHeader: true,
  printShowService: true,
  printShowDate: true,
  printShowQr: false,
  printQrTemplate: "",
  printShowFooter: true,
  printTurnSize: "quad",
  printFeed: 2,
  printCut: true,
  printOpenDrawer: false,
} as const;

const TURN_SIZES = [
  { value: "normal", label: "Normal (1x)" },
  { value: "double", label: "Doble (2x)" },
  { value: "triple", label: "Triple (3x)" },
  { value: "quad", label: "Cuadruple (4x)" },
];

export function AdminSettings() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await api.get<SettingsDTO>("/settings")).data,
  });
  const { data: services } = useQuery({
    queryKey: ["services"],
    queryFn: async () => (await api.get<ServiceDTO[]>("/services")).data,
    staleTime: 60_000,
  });
  const { data: printerInfo } = useQuery<PrinterInfo>({
    queryKey: ["printer-info"],
    queryFn: async () => (await api.get<PrinterInfo>("/printer")).data,
    retry: false,
    staleTime: 30_000,
  });

  const [form, setForm] = useState<SettingsDTO | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Muestras y vista previa ──
  const [turnCode, setTurnCode] = useState("A-001");
  const [serviceId, setServiceId] = useState("0");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  const sampleServiceName =
    services?.find((s) => s.id === serviceId)?.name ?? "Servicio de prueba";

  // Vista previa en vivo con debounce (usa el borrador, aun sin guardar).
  useEffect(() => {
    if (!form) return;
    window.clearTimeout(timer.current);
    setPreviewBusy(true);
    timer.current = window.setTimeout(() => {
      api
        .post<Preview>("/printer/preview", {
          settings: form,
          turnCode,
          serviceName: sampleServiceName,
        })
        .then((res) => {
          setPreview(res.data);
          setPreviewError(null);
        })
        .catch(() =>
          setPreviewError("No se pudo generar la vista previa. Verifica la conexión.")
        )
        .finally(() => setPreviewBusy(false));
    }, 300);
    return () => window.clearTimeout(timer.current);
  }, [form, turnCode, sampleServiceName]);

  if (!form) return <p className="p-8 text-slate-500">Cargando...</p>;

  const update = (patch: Partial<SettingsDTO>) => setForm({ ...form, ...patch });

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await api.patch("/settings", {
        ticketHeader: form.ticketHeader,
        ticketFooter: form.ticketFooter,
        announcePrefix: form.announcePrefix,
        voiceRate: form.voiceRate,
        voicePitch: form.voicePitch,
        marquee: form.marquee,
        voiceVolume: form.voiceVolume,
        printWidth: form.printWidth ?? PRINT_DEFAULTS.printWidth,
        printLogo: form.printLogo ?? PRINT_DEFAULTS.printLogo,
        printLogoFile: form.printLogoFile ?? PRINT_DEFAULTS.printLogoFile,
        printShowHeader: form.printShowHeader ?? PRINT_DEFAULTS.printShowHeader,
        printShowService: form.printShowService ?? PRINT_DEFAULTS.printShowService,
        printShowDate: form.printShowDate ?? PRINT_DEFAULTS.printShowDate,
        printShowQr: form.printShowQr ?? PRINT_DEFAULTS.printShowQr,
        printQrTemplate: form.printQrTemplate ?? PRINT_DEFAULTS.printQrTemplate,
        printShowFooter: form.printShowFooter ?? PRINT_DEFAULTS.printShowFooter,
        printTurnSize: form.printTurnSize ?? PRINT_DEFAULTS.printTurnSize,
        printFeed: form.printFeed ?? PRINT_DEFAULTS.printFeed,
        printCut: form.printCut ?? PRINT_DEFAULTS.printCut,
        printOpenDrawer: form.printOpenDrawer ?? PRINT_DEFAULTS.printOpenDrawer,
      });
      setSaved(true);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      setTimeout(() => setSaved(false), 2500);
    } catch (error) {
      if (axios.isAxiosError<{ message?: string | string[] }>(error)) {
        const message = error.response?.data?.message;
        setSaveError(
          Array.isArray(message)
            ? message.join(" ")
            : message ?? "No se pudieron guardar los cambios. Verifica la conexión y vuelve a intentar."
        );
      } else {
        setSaveError(
          error instanceof Error
            ? error.message
            : "No se pudieron guardar los cambios. Vuelve a intentar."
        );
      }
    } finally {
      setSaving(false);
    }
  };

  const printTest = async () => {
    setTestBusy(true);
    setTestMsg(null);
    try {
      const res = await api.post<{ printed: boolean }>("/printer/test", {
        settings: form,
        turnCode,
        serviceName: sampleServiceName,
      });
      setTestMsg(
        res.data.printed
          ? "Ticket de prueba enviado a la impresora."
          : "No se imprimio (sin impresora conectada / modo simulado)."
      );
    } catch (error) {
      setTestMsg(
        axios.isAxiosError<{ message?: string | string[] }>(error)
          ? String(error.response?.data?.message ?? "Error al imprimir.")
          : "Error al imprimir."
      );
    } finally {
      setTestBusy(false);
    }
  };

  const logoFiles = printerInfo?.logos ?? [];

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Impresion y voz</h2>
            <p className="mt-1 text-sm text-slate-500">
              Define lo que aparece en el ticket y como se anuncia el turno.
            </p>
          </div>

          <section className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Pantalla y anuncio
            </h3>
            <Field label="Mensaje de la pantalla (marquesina)">
              <textarea
                className="input"
                rows={2}
                value={form.marquee}
                onChange={(e) => update({ marquee: e.target.value })}
              />
            </Field>
            <Field label="Palabra inicial del anuncio">
              <input
                className="input"
                value={form.announcePrefix}
                onChange={(e) => update({ announcePrefix: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label={`Velocidad de voz (${form.voiceRate})`}>
                <input
                  type="range"
                  min={0.5}
                  max={1.2}
                  step={0.05}
                  value={form.voiceRate}
                  onChange={(e) => update({ voiceRate: Number(e.target.value) })}
                  className="w-full"
                />
              </Field>
              <Field label={`Tono de voz (${form.voicePitch})`}>
                <input
                  type="range"
                  min={0.8}
                  max={1.2}
                  step={0.05}
                  value={form.voicePitch}
                  onChange={(e) => update({ voicePitch: Number(e.target.value) })}
                  className="w-full"
                />
              </Field>
            </div>
            <Field label={`Volumen de voz (${form.voiceVolume})`}>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={form.voiceVolume}
                onChange={(e) => update({ voiceVolume: Number(e.target.value) })}
                className="w-full"
              />
            </Field>
          </section>

          <section className="space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Impresion del ticket
            </h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Texto superior">
                <textarea
                  className="input"
                  rows={2}
                  value={form.ticketHeader}
                  onChange={(e) => update({ ticketHeader: e.target.value })}
                />
              </Field>
              <Field label="Texto inferior">
                <textarea
                  className="input"
                  rows={2}
                  value={form.ticketFooter}
                  onChange={(e) => update({ ticketFooter: e.target.value })}
                />
              </Field>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <Toggle
                label="Imprimir logo"
                checked={form.printLogo ?? PRINT_DEFAULTS.printLogo}
                onChange={(v) => update({ printLogo: v })}
              />
              {(form.printLogo ?? PRINT_DEFAULTS.printLogo) && (
                <div className="mt-3">
                  <Field label="Archivo del logo">
                    <select
                      className="input"
                      value={form.printLogoFile ?? PRINT_DEFAULTS.printLogoFile}
                      onChange={(e) => update({ printLogoFile: e.target.value })}
                    >
                      {logoFiles.length === 0 && (
                        <option value={form.printLogoFile ?? "logoTiket.png"}>
                          {form.printLogoFile ?? "logoTiket.png"}
                        </option>
                      )}
                      {logoFiles.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <p className="mt-1 text-xs text-slate-400">
                    PNG disponibles en <code>public/media/imagenes</code>.
                    {!printerInfo && " (carga pendiente: se necesita sesión y API)."}
                  </p>
                </div>
              )}
            </div>

            <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
              <Toggle
                label="Mostrar texto superior"
                checked={form.printShowHeader ?? PRINT_DEFAULTS.printShowHeader}
                onChange={(v) => update({ printShowHeader: v })}
              />
              <Toggle
                label="Mostrar servicio"
                checked={form.printShowService ?? PRINT_DEFAULTS.printShowService}
                onChange={(v) => update({ printShowService: v })}
              />
              <Toggle
                label="Mostrar fecha y hora"
                checked={form.printShowDate ?? PRINT_DEFAULTS.printShowDate}
                onChange={(v) => update({ printShowDate: v })}
              />
              <Toggle
                label="Mostrar texto inferior"
                checked={form.printShowFooter ?? PRINT_DEFAULTS.printShowFooter}
                onChange={(v) => update({ printShowFooter: v })}
              />
              <Toggle
                label="Imprimir QR"
                checked={form.printShowQr ?? PRINT_DEFAULTS.printShowQr}
                onChange={(v) => update({ printShowQr: v })}
              />
              <Toggle
                label="Cortar papel"
                checked={form.printCut ?? PRINT_DEFAULTS.printCut}
                onChange={(v) => update({ printCut: v })}
              />
              <Toggle
                label="Abrir cajon"
                checked={form.printOpenDrawer ?? PRINT_DEFAULTS.printOpenDrawer}
                onChange={(v) => update({ printOpenDrawer: v })}
              />
            </div>

            {(form.printShowQr ?? PRINT_DEFAULTS.printShowQr) && (
              <Field label="Plantilla del QR">
                <input
                  className="input"
                  placeholder="https://ejemplo.com/qr?T={turno}&S={servicio}"
                  value={form.printQrTemplate ?? ""}
                  onChange={(e) => update({ printQrTemplate: e.target.value })}
                />
                <p className="mt-1 text-xs text-slate-400">
                  Usa {"{turno}"} y {"{servicio}"} como marcadores.
                </p>
              </Field>
            )}

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Tamano del turno">
                <select
                  className="input"
                  value={form.printTurnSize ?? PRINT_DEFAULTS.printTurnSize}
                  onChange={(e) => update({ printTurnSize: e.target.value })}
                >
                  {TURN_SIZES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Columnas (ancho)">
                <input
                  type="number"
                  min={20}
                  max={80}
                  className="input"
                  value={form.printWidth ?? PRINT_DEFAULTS.printWidth}
                  onChange={(e) => update({ printWidth: Number(e.target.value) })}
                />
              </Field>
              <Field label="Lineas al final">
                <input
                  type="number"
                  min={0}
                  max={10}
                  className="input"
                  value={form.printFeed ?? PRINT_DEFAULTS.printFeed}
                  onChange={(e) => update({ printFeed: Number(e.target.value) })}
                />
              </Field>
            </div>
          </section>

          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "Guardando..." : saved ? "Guardado" : "Guardar cambios"}
            </button>
            {saveError && (
              <p role="alert" className="text-sm text-red-600">
                {saveError}
              </p>
            )}
          </div>
        </div>

        {/* ── Vista previa ── */}
        <aside className="lg:sticky lg:top-6">
          <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Vista previa del ticket</h3>
              <p className="mt-1 text-xs text-slate-500">
                Se actualiza mientras editas. No se guarda nada hasta pulsar Guardar.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Codigo">
                <input
                  className="input"
                  value={turnCode}
                  onChange={(e) => setTurnCode(e.target.value)}
                />
              </Field>
              <Field label="Servicio">
                <select
                  className="input"
                  value={serviceId}
                  onChange={(e) => setServiceId(e.target.value)}
                >
                  <option value="0">Servicio de prueba</option>
                  {services?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="relative rounded-xl bg-slate-900 p-4 ring-1 ring-slate-700">
              {previewBusy && (
                <span className="absolute right-3 top-3 text-[10px] uppercase tracking-wider text-slate-400">
                  actualizando
                </span>
              )}
              <pre className="min-h-[160px] whitespace-pre font-mono text-[11px] leading-4 text-slate-100">
                {preview
                  ? preview.lines.join("\n")
                  : previewError
                    ? previewError
                    : "Generando vista previa..."}
              </pre>
            </div>
            {previewError && <p className="text-xs text-red-600">{previewError}</p>}

            <button
              onClick={printTest}
              disabled={testBusy}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
            >
              {testBusy ? "Imprimiendo..." : "Imprimir prueba"}
            </button>
            {testMsg && <p className="text-xs text-slate-600">{testMsg}</p>}

            <div className="border-t border-slate-200 pt-3 text-xs text-slate-500">
              <p className="font-semibold text-slate-700">Impresora</p>
              {printerInfo ? (
                <ul className="mt-1 space-y-0.5">
                  <li>
                    Estado:{" "}
                    {printerInfo.connected ? (
                      <span className="text-emerald-600">conectada</span>
                    ) : (
                      <span className="text-amber-600">simulada (no imprime)</span>
                    )}
                  </li>
                  <li>Dispositivo: {printerInfo.printerName ?? printerInfo.interface}</li>
                  <li>Ancho: {printerInfo.width} columnas</li>
                </ul>
              ) : (
                <p>Consultando...</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
      />
      <span className="text-sm text-slate-700">{label}</span>
    </label>
  );
}
