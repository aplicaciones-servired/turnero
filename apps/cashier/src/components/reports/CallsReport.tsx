import { useState } from "react";
import type { ReportCalls } from "@turnero/shared";
import { Alert, Card, errorMessage } from "../ui";
import { useReport } from "./api";
import { BarList, ChartCard, Kpi, LineChart, LoadingBlock } from "./charts";
import { ExportButton } from "./common";
import { fmtDateTime, fmtDay, fmtDuration, type ReportFilters } from "./utils";

export function CallsReport({
  filters,
  users,
}: {
  filters: ReportFilters;
  users: Array<{ id: string; name: string }>;
}) {
  const [userId, setUserId] = useState("");
  const params = {
    ...filters,
    userId: userId ? Number(userId) : undefined,
  };
  const { data, isLoading, error } = useReport<ReportCalls>("calls", params);

  if (isLoading) return <LoadingBlock />;
  if (error) return <Alert tone="error">{errorMessage(error, "No se pudieron cargar los llamados.")}</Alert>;
  if (!data) return null;

  const cashiers = data.rows.filter((row) => row.calls > 0);
  const average = cashiers.length > 0 ? data.total / cashiers.length : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-800">Turnos llamados por cajera</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Cuenta los turnos en que cada asesor presiono Llamar, segun la fecha del llamado.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-slate-500">
            Asesor
            <select
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              className="input mt-1 w-48"
            >
              <option value="">Todas</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <ExportButton report="calls" filters={params} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Total de llamados" value={data.total} tone="blue" />
        <Kpi label="Cajeras con llamados" value={cashiers.length} tone="green" />
        <Kpi
          label="Promedio por cajera"
          value={average.toFixed(1)}
          hint="Turnos llamados"
          tone="violet"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <ChartCard
          title="Ranking de llamados"
          subtitle="Turnos llamados por asesor"
          className="lg:col-span-2"
        >
          <BarList
            data={data.rows.slice(0, 12).map((row) => ({
              label: row.name,
              value: row.calls,
              hint: `${row.finished} atendidos`,
            }))}
            emptyText="Sin llamados en el periodo"
          />
        </ChartCard>

        <ChartCard
          title="Llamados por dia"
          subtitle="Actividad diaria del equipo"
          className="lg:col-span-3"
        >
          <LineChart
            labels={data.byDay.map((row) => row.date)}
            series={[
              {
                name: "Llamados",
                color: "#2563eb",
                values: data.byDay.map((row) => row.calls),
              },
            ]}
            xFormat={fmtDay}
          />
        </ChartCard>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5">#</th>
                <th className="px-3 py-2.5">Asesor</th>
                <th className="px-3 py-2.5 text-right">Llamados</th>
                <th className="px-3 py-2.5 text-right">Atendidos</th>
                <th className="px-3 py-2.5 text-right">Ausentes</th>
                <th className="px-3 py-2.5 text-right">Transferidos</th>
                <th className="px-3 py-2.5 text-right">Espera prom</th>
                <th className="px-3 py-2.5">Primera llamada</th>
                <th className="px-3 py-2.5">Ultima llamada</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, index) => (
                <tr key={row.userId} className="border-t border-slate-100">
                  <td className="px-3 py-2.5 text-slate-400">{index + 1}</td>
                  <td className="px-3 py-2.5 font-semibold text-slate-700">{row.name}</td>
                  <td className="px-3 py-2.5 text-right text-lg font-bold tabular-nums text-blue-700">
                    {row.calls}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">
                    {row.finished}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-red-600">{row.absent}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-amber-600">
                    {row.transferred}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                    {fmtDuration(row.waitAvgSec)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">
                    {fmtDateTime(row.firstCallAt)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">
                    {fmtDateTime(row.lastCallAt)}
                  </td>
                </tr>
              ))}
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
