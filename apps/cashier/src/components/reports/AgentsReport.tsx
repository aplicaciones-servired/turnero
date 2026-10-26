import type { ReportAgents } from "@turnero/shared";
import { Alert, Card, errorMessage } from "../ui";
import { useReport } from "./api";
import { BarList, ChartCard, Kpi, LoadingBlock } from "./charts";
import { ExportButton } from "./common";
import { fmtDuration, fmtPct, type ReportFilters } from "./utils";

export function AgentsReport({ filters }: { filters: ReportFilters }) {
  const { data, isLoading, error } = useReport<ReportAgents>("agents", filters);

  if (isLoading) return <LoadingBlock />;
  if (error) return <Alert tone="error">{errorMessage(error, "No se pudo cargar la productividad.")}</Alert>;
  if (!data) return null;

  const totalCalls = data.rows.reduce((sum, row) => sum + row.calls, 0);
  const totalFinished = data.rows.reduce((sum, row) => sum + row.finished, 0);
  const totalAbsent = data.rows.reduce((sum, row) => sum + row.absent, 0);
  const resolved = totalFinished + totalAbsent;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Productividad por asesor segun los turnos llamados.</p>
        <ExportButton report="agents" filters={filters} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Turnos llamados" value={totalCalls} tone="blue" />
        <Kpi label="Atendidos" value={totalFinished} tone="green" />
        <Kpi
          label="Efectividad"
          value={resolved > 0 ? fmtPct((totalFinished / resolved) * 100) : "—"}
          hint={`${totalAbsent} ausentes`}
          tone="violet"
        />
      </div>

      <ChartCard title="Llamados por asesor" subtitle="Top del periodo">
        <BarList
          data={data.rows.map((row) => ({
            label: row.name,
            value: row.calls,
            hint: `${row.finished} atendidos`,
          }))}
        />
      </ChartCard>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Asesor</th>
                <th className="px-3 py-2.5 text-right">Llamados</th>
                <th className="px-3 py-2.5 text-right">Atendidos</th>
                <th className="px-3 py-2.5 text-right">Ausentes</th>
                <th className="px-3 py-2.5 text-right">Transferidos</th>
                <th className="px-3 py-2.5 text-right">% atendido</th>
                <th className="px-3 py-2.5 text-right">Espera prom</th>
                <th className="px-3 py-2.5 text-right">Atencion prom</th>
                <th className="px-3 py-2.5">Efectividad</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => {
                const base = row.finished + row.absent;
                const effectiveness = base > 0 ? (row.finished / base) * 100 : 0;
                return (
                  <tr key={row.userId} className="border-t border-slate-100">
                    <td className="px-3 py-2.5 font-medium text-slate-700">{row.name}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-blue-700">
                      {row.calls}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">
                      {row.finished}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-red-600">
                      {row.absent}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-amber-600">
                      {row.transferred}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                      {fmtPct(effectiveness)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                      {fmtDuration(row.waitAvgSec)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                      {fmtDuration(row.attentionAvgSec)}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="h-2 w-full max-w-[160px] overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${Math.min(100, effectiveness)}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-sm text-slate-400">
                    Sin llamados en el periodo
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
