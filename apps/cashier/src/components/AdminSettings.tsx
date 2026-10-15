import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import type { SettingsDTO } from "@turnero/shared";
import { api } from "../api";

export function AdminSettings() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await api.get<SettingsDTO>("/settings")).data,
  });
  const [form, setForm] = useState<SettingsDTO | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  if (!form) return <p className="p-8 text-slate-500">Cargando...</p>;

  const update = (patch: Partial<SettingsDTO>) => setForm({ ...form, ...patch });

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const { ticketHeader, ticketFooter, announcePrefix, voiceRate, voicePitch, marquee, voiceVolume } = form;
      await api.patch("/settings", {
        ticketHeader,
        ticketFooter,
        announcePrefix,
        voiceRate,
        voicePitch,
        marquee,
        voiceVolume,
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

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h2 className="text-lg font-semibold text-slate-800">Impresion y voz</h2>
      <p className="mt-1 text-sm text-slate-500">
        Define lo que aparece en el ticket y como se anuncia el turno.
      </p>

      <div className="mt-5 space-y-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <Field label="Mensaje de la pantalla (marquesina)">
          <textarea
            className="input"
            rows={2}
            value={form.marquee}
            onChange={(e) => update({ marquee: e.target.value })}
          />
        </Field>
        <Field label="Texto superior del ticket">
          <textarea
            className="input"
            rows={2}
            value={form.ticketHeader}
            onChange={(e) => update({ ticketHeader: e.target.value })}
          />
        </Field>
        <Field label="Texto inferior del ticket">
          <textarea
            className="input"
            rows={2}
            value={form.ticketFooter}
            onChange={(e) => update({ ticketFooter: e.target.value })}
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

        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700"
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
