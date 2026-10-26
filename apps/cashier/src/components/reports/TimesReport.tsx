import { useState } from "react";
import type { ReportTimeRow, ReportTimes } from "@turnero/shared";
import { Alert, Card, errorMessage } from "../ui";
import { useReport } from "./api";
import { BarList, ChartCard, LoadingBlock } from "./charts";
import { ExportButton } from "./common";
import { fmtDuration, type ReportFilters } from "./utils";

type View = "service" | "agent";

export function TimesReport({ filters }: { filters: ReportFilters }) {
  const [view, setView] = useState<View>("service");
  const { data, isLoading, error } = useReport<ReportTimes>("times", filters);

  if (isLoading) return <LoadingBlock />;
  if (error) return <Alert tone="error">{errorMessage(error, "No se pudieron cargar los tiempos.")}</Alert>;
  if (!data) return null;

  const rows = view === "service" ? data.byService : data.byAgent;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-slate-200/70 p-1 text-sm">
          <button
            onClick={() => setView("service")}
            className={
              view === "service"
                ? "rounded-md bg-white px-3 py-1.5 font-semibold text-slate-800 shadow-sm"
                : "rounded-md px-3 py-1.5 text-slate-500"
            }
          >
            Por servicio
          </button>
          <button
            onClick={() => setView("agent")}
            className={
              view === "agent"
                ? "rounded-md bg-white px-3 py-1.5 font-semibold text-slate-800 shadow-sm"
                : "rounded-md px-3 py-1.5 text-slate-500"
            }
          >
            Por asesor
          </button>
        </div>
        <ExportButton report="times" filters={filters} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Espera promedio"
          subtitle="Tiempo desde que llega el turno hasta el primer llamado"
        >
          <BarList
            data={rows.map((row) => ({
              label: row.name,
              value: row.waitAvgSec ?? 0,
              hint: `${row.called} llamados`,
            }))}
            format={fmtDuration}
          />
        </ChartCard>
        <ChartCard
          title="Atencion promedio"
          subtitle="Tiempo desde el llamado hasta el cierre del turno"
        >
          <BarList
            data={rows.map((row) => ({
              label: row.name,
              value: row.attentionAvgSec ?? 0,
              hint: `${row.finished} atendidos`,
            }))}
            format={fmtDuration}
          />
        </ChartCard>
      </div>

      <Card>
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Detalle de tiempos</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            La mediana y el p90 reducen el efecto de casos extremos.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5">{view === "service" ? "Servicio" : "Asesor"}</th>
                <th className="px-3 py-2.5 text-right">Llamados</th>
                <th className="px-3 py-2.5 text-right">Atendidos</th>
                <th className="px-3 py-2.5 text-right">Ausentes</th>
                <th className="px-3 py-2.5 text-right">Espera prom</th>
                <th className="px-3 py-2.5 text-right">Espera med</th>
                <th className="px-3 py-2.5 text-right">Espera p90</th>
                <th className="px-3 py-2.5 text-right">Atencion prom</th>
                <th className="px-3 py-2.5 text-right">Atencion med</th>
                <th className="px-3 py-2.5 text-right">Atencion p90</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <TimeRow key={row.key ?? "none"} row={row} />
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-sm text-slate-400">
                    Sin llamados para el periodo
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function TimeRow({ row }: { row: ReportTimeRow }) {
  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2.5 font-medium text-slate-700">{row.name}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{row.called}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{row.finished}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-red-600">{row.absent}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
        {fmtDuration(row.waitAvgSec)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
        {fmtDuration(row.waitMedianSec)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
        {fmtDuration(row.waitP90Sec)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
        {fmtDuration(row.attentionAvgSec)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
        {fmtDuration(row.attentionMedianSec)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
        {fmtDuration(row.attentionP90Sec)}
      </td>
    </tr>
  );
}
