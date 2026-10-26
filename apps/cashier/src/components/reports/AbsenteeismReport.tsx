import type { ReportAbsenteeism } from "@turnero/shared";
import { Alert, Card, errorMessage } from "../ui";
import { useReport } from "./api";
import { BarList, ChartCard, Kpi, LineChart, LoadingBlock } from "./charts";
import { ExportButton } from "./common";
import { fmtHour, fmtPct, type ReportFilters } from "./utils";

export function AbsenteeismReport({ filters }: { filters: ReportFilters }) {
  const { data, isLoading, error } = useReport<ReportAbsenteeism>("absenteeism", filters);

  if (isLoading) return <LoadingBlock />;
  if (error) return <Alert tone="error">{errorMessage(error, "No se pudo cargar el ausentismo.")}</Alert>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Ausentismo sobre los turnos finalizados en el periodo.
        </p>
        <ExportButton report="absenteeism" filters={filters} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Turnos finalizados" value={data.total} hint="Cerrados en el periodo" tone="blue" />
        <Kpi label="Ausentes" value={data.absent} tone="red" />
        <Kpi label="Tasa de ausentismo" value={fmtPct(data.rate)} tone="amber" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Ausentismo por servicio" subtitle="Porcentaje de ausentes">
          <BarList
            data={data.byService.map((row) => ({
              label: row.name,
              value: row.rate,
              hint: `${row.absent}/${row.total}`,
              color: row.rate >= 15 ? "#ef4444" : row.rate >= 8 ? "#f59e0b" : "#10b981",
            }))}
            max={Math.max(10, ...data.byService.map((row) => row.rate))}
            format={fmtPct}
          />
        </ChartCard>

        <ChartCard title="Ausentismo por hora" subtitle="Hora de llegada del turno">
          <LineChart
            labels={data.byHour.map((row) => String(row.hour))}
            series={[
              {
                name: "Turnos",
                color: "#2563eb",
                values: data.byHour.map((row) => row.total),
              },
              {
                name: "Ausentes",
                color: "#ef4444",
                values: data.byHour.map((row) => row.absent),
              },
            ]}
            xFormat={(value) => fmtHour(Number(value))}
          />
        </ChartCard>
      </div>

      <Card>
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Ausentismo por asesor</h3>
          <p className="mt-0.5 text-xs text-slate-500">Turnos llamados por cada asesor</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Asesor</th>
                <th className="px-4 py-2.5 text-right">Turnos</th>
                <th className="px-4 py-2.5 text-right">Ausentes</th>
                <th className="px-4 py-2.5 text-right">Tasa</th>
                <th className="px-4 py-2.5">Nivel</th>
              </tr>
            </thead>
            <tbody>
              {data.byAgent.map((row) => (
                <tr key={row.key ?? "none"} className="border-t border-slate-100">
                  <td className="px-4 py-2.5 font-medium text-slate-700">{row.name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.total}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{row.absent}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-slate-700">
                    {fmtPct(row.rate)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="h-2 w-full max-w-[220px] overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{ width: `${Math.min(100, row.rate)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {data.byAgent.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-sm text-slate-400">
                    Sin turnos finalizados en el periodo
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
