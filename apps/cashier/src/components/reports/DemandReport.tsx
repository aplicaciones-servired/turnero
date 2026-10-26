import type { ReportDemand } from "@turnero/shared";
import { Alert, errorMessage } from "../ui";
import { useReport } from "./api";
import { BarList, ChartCard, Heatmap, Kpi, LoadingBlock } from "./charts";
import { ExportButton } from "./common";
import { fmtHour, type ReportFilters } from "./utils";

const DAYS = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];

export function DemandReport({ filters }: { filters: ReportFilters }) {
  const { data, isLoading, error } = useReport<ReportDemand>("demand", filters);

  if (isLoading) return <LoadingBlock />;
  if (error) return <Alert tone="error">{errorMessage(error, "No se pudo cargar la demanda.")}</Alert>;
  if (!data) return null;

  const peak = [...data.cells].sort((a, b) => b.count - a.count).slice(0, 6);
  const activeSlots = data.cells.filter((cell) => cell.count > 0).length;
  const averageSlot = activeSlots > 0 ? data.total / activeSlots : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Distribucion de turnos por dia de la semana y hora de llegada.
        </p>
        <ExportButton report="demand" filters={filters} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Turnos en el periodo" value={data.total} tone="blue" />
        <Kpi label="Hora/dia mas ocupado" value={data.max} hint="Turnos en una hora" tone="red" />
        <Kpi
          label="Promedio por franja activa"
          value={averageSlot.toFixed(1)}
          hint={`${activeSlots} franjas con movimiento`}
          tone="violet"
        />
      </div>

      <ChartCard
        title="Mapa de calor: demanda por dia y hora"
        subtitle="Mas oscuro significa mas turnos generados"
      >
        <Heatmap cells={data.cells} max={data.max} />
      </ChartCard>

      <ChartCard title="Franjas con mas demanda" subtitle="Top 6 dia/hora">
        <BarList
          data={peak.map((cell) => ({
            label: `${DAYS[cell.weekday] ?? "Dia"} ${fmtHour(cell.hour)}`,
            value: cell.count,
          }))}
          emptyText="Sin datos para el periodo"
        />
      </ChartCard>
    </div>
  );
}
