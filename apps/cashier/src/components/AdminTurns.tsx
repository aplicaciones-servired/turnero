import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { TurnDTO, TurnStatus } from "@turnero/shared";
import { api } from "../api";

const STATUS: { value: "" | TurnStatus; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "waiting", label: "En espera" },
  { value: "called", label: "Llamados" },
  { value: "finished", label: "Finalizados" },
  { value: "skipped", label: "Pasados" },
];

const statusLabel: Record<TurnStatus, string> = {
  waiting: "En espera",
  called: "Llamado",
  serving: "Atendiendo",
  finished: "Finalizado",
  skipped: "Pasado",
};

export function AdminTurns() {
  const [status, setStatus] = useState<"" | TurnStatus>("");
  const { data, isLoading } = useQuery({
    queryKey: ["turns", status],
    queryFn: async () => {
      const qs = status ? `?status=${status}` : "";
      return (await api.get<TurnDTO[]>(`/turns${qs}`)).data;
    },
  });

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Todos los turnos</h2>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as "" | TurnStatus)}
          className="input w-48"
        >
          {STATUS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <p className="mt-4 text-slate-500">Cargando...</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3">Turno</th>
                <th className="px-4 py-3">Servicio</th>
                <th className="px-4 py-3">Caja</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Creado</th>
                <th className="px-4 py-3">Llamado</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((t) => (
                <tr key={t.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-lg font-bold text-slate-700">{t.code}</td>
                  <td className="px-4 py-3 text-slate-600">{t.serviceName}</td>
                  <td className="px-4 py-3 text-slate-500">{t.counterName ?? "-"}</td>
                  <td className="px-4 py-3 text-slate-600">{statusLabel[t.status]}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(t.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {t.calledAt ? new Date(t.calledAt).toLocaleTimeString() : "-"}
                  </td>
                </tr>
              ))}
              {data?.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Sin turnos
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
