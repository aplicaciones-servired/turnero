import type { ReportSummary } from "@turnero/shared";
import { Alert, Card, errorMessage } from "../ui";
import { useReport } from "./api";
import { BarList, ChartCard, Donut, Kpi, LineChart, LoadingBlock } from "./charts";
import { ExportButton } from "./common";
import { fmtDay, fmtDuration, fmtHour, fmtPct, type ReportFilters } from "./utils";

export function SummaryReport({ filters }: { filters: ReportFilters }) {
  const { data, isLoading, error } = useReport<ReportSummary>("summary", filters);

  if (isLoading) return <LoadingBlock />;
  if (error) return <Alert tone="error">{errorMessage(error, "No se pudo cargar el resumen.")}</Alert>;
  if (!data) return null;

  const multiDay = filters.from !== filters.to;
  const pending = Math.max(
    0,
    data.totals.tickets - data.totals.finished - data.totals.absent - data.totals.cancelled
  );
  const statusData = [
    { label: "Atendidos", value: data.totals.finished, color: "#10b981" },
    { label: "Ausentes", value: data.totals.absent, color: "#ef4444" },
    { label: "Cancelados", value: data.totals.cancelled, color: "#94a3b8" },
    { label: "Pendientes", value: pending, color: "#2563eb" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Resumen de {filters.from} a {filters.to}
        </p>
        <ExportButton report="summary" filters={filters} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Turnos generados"
          value={data.totals.tickets}
          hint={`${data.totals.called} llamados`}
          tone="blue"
        />
        <Kpi
          label="Atendidos"
          value={data.totals.finished}
          hint={`${fmtPct(data.rates.finished)} del total resuelto`}
          tone="green"
        />
        <Kpi
          label="Ausentes"
          value={data.totals.absent}
          hint={`${fmtPct(data.rates.absent)} de ausentismo`}
          tone="red"
        />
        <Kpi
          label="En espera ahora"
          value={data.totals.waitingNow}
          hint={`${data.totals.deferredNow} aplazados`}
          tone="violet"
        />
        <Kpi label="Espera promedio" value={fmtDuration(data.averages.waitSec)} />
        <Kpi label="Atencion promedio" value={fmtDuration(data.averages.attentionSec)} />
        <Kpi label="Tiempo total promedio" value={fmtDuration(data.averages.totalSec)} />
        <Kpi
          label="Transferidos"
          value={data.totals.transferred}
          hint="Movimientos a otro servicio"
          tone="amber"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          title={multiDay ? "Turnos por dia" : "Turnos por hora"}
          subtitle="Volumen, atenciones y ausencias"
          className="lg:col-span-2"
        >
          {multiDay ? (
            <LineChart
              labels={data.byDay.map((row) => row.date)}
              series={[
                { name: "Generados", color: "#2563eb", values: data.byDay.map((row) => row.tickets) },
                {
                  name: "Atendidos",
                  color: "#10b981",
                  values: data.byDay.map((row) => row.finished),
                },
                { name: "Ausentes", color: "#ef4444", values: data.byDay.map((row) => row.absent) },
              ]}
              xFormat={fmtDay}
            />
          ) : (
            <LineChart
              labels={data.byHour.map((row) => String(row.hour))}
              series={[
                {
                  name: "Generados",
                  color: "#2563eb",
                  values: data.byHour.map((row) => row.tickets),
                },
                {
                  name: "Atendidos",
                  color: "#10b981",
                  values: data.byHour.map((row) => row.finished),
                },
                {
                  name: "Ausentes",
                  color: "#ef4444",
                  values: data.byHour.map((row) => row.absent),
                },
              ]}
              xFormat={(value) => fmtHour(Number(value))}
            />
          )}
        </ChartCard>

        <ChartCard title="Estado de los turnos" subtitle="Resultado del periodo">
          <Donut data={statusData} centerLabel="Turnos" />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <ChartCard
          title="Turnos por servicio"
          subtitle="Incluye turnos pendientes y finalizados"
          className="lg:col-span-2"
        >
          <BarList
            data={data.byService.map((row) => ({
              label: row.name,
              value: row.tickets,
              hint: row.absent > 0 ? `${row.absent} aus.` : undefined,
            }))}
          />
        </ChartCard>

        <Card className="lg:col-span-3">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-800">Detalle por servicio</h3>
            <p className="mt-0.5 text-xs text-slate-500">Tiempos promedio y resultado</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">Servicio</th>
                  <th className="px-4 py-2.5 text-right">Turnos</th>
                  <th className="px-4 py-2.5 text-right">Atendidos</th>
                  <th className="px-4 py-2.5 text-right">Ausentes</th>
                  <th className="px-4 py-2.5 text-right">Espera</th>
                  <th className="px-4 py-2.5 text-right">Atencion</th>
                </tr>
              </thead>
              <tbody>
                {data.byService.map((row) => (
                  <tr key={row.serviceId ?? "none"} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{row.name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{row.tickets}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">
                      {row.finished}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{row.absent}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                      {fmtDuration(row.waitAvgSec)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                      {fmtDuration(row.attentionAvgSec)}
                    </td>
                  </tr>
                ))}
                {data.byService.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                      Sin datos para el periodo
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
