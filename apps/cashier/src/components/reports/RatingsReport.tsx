import { useState } from "react";
import type { ReportRatingValue, ReportRatings } from "@turnero/shared";
import { Alert, Card, errorMessage } from "../ui";
import { useReport } from "./api";
import { ChartCard, Donut, Kpi, LineChart, LoadingBlock } from "./charts";
import { ExportButton } from "./common";
import { fmtDay, fmtPct, type ReportFilters } from "./utils";

function ratingColor(value: string, index: number): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === "excelente") return "#10b981";
  if (normalized === "bueno") return "#2563eb";
  if (normalized === "regular") return "#f59e0b";
  if (normalized === "malo") return "#ef4444";
  return ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"][index % 6];
}

export function RatingsReport({
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
  const { data, isLoading, error } = useReport<ReportRatings>("ratings", params);

  if (isLoading) return <LoadingBlock />;
  if (error) return <Alert tone="error">{errorMessage(error, "No se pudieron cargar las calificaciones.")}</Alert>;
  if (!data) return null;

  const top = [...data.byValue].sort((a, b) => b.count - a.count)[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-800">Calificaciones de atencion</h3>
          <p className="mt-0.5 text-sm text-slate-500">
            Encuestas registradas en la base historica. El kiosco actual no captura encuestas.
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
              <option value="">Todos</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </label>
          <ExportButton report="ratings" filters={params} />
        </div>
      </div>

      {data.total === 0 ? (
        <Card>
          <div className="px-6 py-12 text-center">
            <p className="text-base font-semibold text-slate-700">Sin calificaciones en el periodo</p>
            <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
              La base conserva las tablas de encuestas, pero el turnero nuevo aun no solicita
              calificaciones al cliente. Cuando se active la captura, este reporte se llenara
              automaticamente.
            </p>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi label="Calificaciones" value={data.total} tone="blue" />
            <Kpi
              label="Calificacion mas frecuente"
              value={top?.value ?? "—"}
              hint={top ? `${top.count} respuestas (${fmtPct(top.pct)})` : undefined}
              tone="green"
            />
            <Kpi
              label="Asesores calificados"
              value={data.byAgent.length}
              hint={`${data.byQuestion.length} preguntas`}
              tone="violet"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Distribucion general" subtitle="Todas las respuestas del periodo">
              <Donut
                data={data.byValue.map((value, index) => ({
                  label: value.value,
                  value: value.count,
                  color: ratingColor(value.value, index),
                }))}
                centerLabel="Respuestas"
              />
            </ChartCard>

            <ChartCard title="Tendencia diaria" subtitle="Cantidad de calificaciones por dia">
              <LineChart
                labels={data.byDay.map((row) => row.date)}
                series={[
                  {
                    name: "Calificaciones",
                    color: "#8b5cf6",
                    values: data.byDay.map((row) => row.total),
                  },
                ]}
                xFormat={fmtDay}
              />
            </ChartCard>
          </div>

          <Card>
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-800">Calificaciones por asesor</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5">Asesor</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                    <th className="px-4 py-2.5">Distribucion</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byAgent.map((agent) => (
                    <tr key={agent.userId} className="border-t border-slate-100 align-top">
                      <td className="px-4 py-3 font-medium text-slate-700">{agent.name}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {agent.total}
                      </td>
                      <td className="px-4 py-3">
                        <ValueChips values={agent.values} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-800">Calificaciones por pregunta</h3>
            </div>
            <div className="space-y-5 px-4 py-4">
              {data.byQuestion.map((question) => (
                <div key={question.questionId ?? "none"}>
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-slate-700">{question.question}</p>
                    <span className="text-xs text-slate-400">{question.total} respuestas</span>
                  </div>
                  <DistributionBar values={question.values} />
                  <ValueChips values={question.values} className="mt-2" />
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function DistributionBar({ values }: { values: ReportRatingValue[] }) {
  const sorted = [...values].sort((a, b) => b.count - a.count);
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
      {sorted.map((value, index) => (
        <div
          key={value.value}
          title={`${value.value}: ${value.count} (${fmtPct(value.pct)})`}
          style={{
            width: `${value.pct}%`,
            backgroundColor: ratingColor(value.value, index),
          }}
        />
      ))}
    </div>
  );
}

function ValueChips({
  values,
  className = "",
}: {
  values: ReportRatingValue[];
  className?: string;
}) {
  const sorted = [...values].sort((a, b) => b.count - a.count);
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {sorted.map((value, index) => (
        <span
          key={value.value}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
          style={{ backgroundColor: ratingColor(value.value, index) }}
        >
          {value.value}
          <span className="rounded-full bg-white/25 px-1.5 font-semibold">{value.count}</span>
        </span>
      ))}
    </div>
  );
}
