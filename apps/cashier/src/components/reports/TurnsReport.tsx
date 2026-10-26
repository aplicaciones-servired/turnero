import { useEffect, useState } from "react";
import type { ReportTurnRow, ReportTurnStatus, ReportTurnsPage } from "@turnero/shared";
import { Alert, Button, Card, errorMessage } from "../ui";
import { useReport } from "./api";
import { LoadingBlock } from "./charts";
import { ExportButton } from "./common";
import {
  fmtDateTime,
  fmtDuration,
  turnStatusClasses,
  turnStatusLabel,
  type ReportFilters,
} from "./utils";

const STATUS: Array<{ value: ReportTurnStatus; label: string }> = [
  { value: "all", label: "Todos (sin transferidos)" },
  { value: "finished", label: "Atendidos" },
  { value: "absent", label: "Ausentes" },
  { value: "waiting", label: "Pendientes" },
  { value: "transferred", label: "Transferidos" },
  { value: "cancelled", label: "Cancelados" },
];

export function TurnsReport({
  filters,
  users,
}: {
  filters: ReportFilters;
  users: Array<{ id: string; name: string }>;
}) {
  const [status, setStatus] = useState<ReportTurnStatus>("all");
  const [userId, setUserId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const params = {
    ...filters,
    status,
    userId: userId ? Number(userId) : undefined,
    page,
    pageSize,
  };
  useEffect(() => {
    setPage(1);
  }, [filters]);

  const { data, isLoading, isFetching, error } = useReport<ReportTurnsPage>("turns", params);

  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const exportFilters = {
    ...filters,
    status,
    userId: userId ? Number(userId) : undefined,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-slate-500">
            Estado
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as ReportTurnStatus);
                setPage(1);
              }}
              className="input mt-1 w-52"
            >
              {STATUS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-slate-500">
            Asesor
            <select
              value={userId}
              onChange={(event) => {
                setUserId(event.target.value);
                setPage(1);
              }}
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
          <label className="text-xs font-medium text-slate-500">
            Filas
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
              className="input mt-1 w-24"
            >
              {[25, 50, 100, 200].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ExportButton report="turns" filters={exportFilters} />
      </div>

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <Alert tone="error">{errorMessage(error, "No se pudieron cargar los turnos.")}</Alert>
      ) : (
        <>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">Llegada</th>
                    <th className="px-3 py-2.5">Turno</th>
                    <th className="px-3 py-2.5">Servicio</th>
                    <th className="px-3 py-2.5">Asesor</th>
                    <th className="px-3 py-2.5">Estado</th>
                    <th className="px-3 py-2.5 text-right">Espera</th>
                    <th className="px-3 py-2.5 text-right">Atencion</th>
                    <th className="px-3 py-2.5 text-right">Total</th>
                    <th className="px-3 py-2.5 text-right">Llam.</th>
                    <th className="px-3 py-2.5">Cliente</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.rows.map((row) => (
                    <TurnRow key={row.id} row={row} />
                  ))}
                  {data?.rows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="py-10 text-center text-sm text-slate-400">
                        Sin turnos para los filtros seleccionados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
            <span>
              {data?.total ?? 0} turno(s) · pagina {page} de {pages}
              {isFetching && <span className="ml-2 text-xs text-blue-500">actualizando...</span>}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={page <= 1 || isFetching}
              >
                Anterior
              </Button>
              <Button
                variant="secondary"
                onClick={() => setPage((value) => Math.min(pages, value + 1))}
                disabled={page >= pages || isFetching}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </>
      )}

      <p className="text-xs text-slate-400">
        Los turnos transferidos aparecen como movimiento aparte y no suman dos veces en los
        totales del resumen.
      </p>
    </div>
  );
}

function TurnRow({ row }: { row: ReportTurnRow }) {
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500">
        {fmtDateTime(row.arrivedAt)}
      </td>
      <td className="px-3 py-2.5 font-bold text-slate-700">{row.turn ?? "—"}</td>
      <td className="px-3 py-2.5 text-slate-600">{row.serviceName ?? "—"}</td>
      <td className="px-3 py-2.5 text-slate-600">{row.userName ?? "—"}</td>
      <td className="px-3 py-2.5">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${turnStatusClasses(
            row.status,
            row.observation
          )}`}
        >
          {turnStatusLabel(row.status, row.observation)}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
        {fmtDuration(row.waitSec)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
        {fmtDuration(row.attentionSec)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
        {fmtDuration(row.totalSec)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{row.calls}</td>
      <td className="px-3 py-2.5 text-slate-500">
        <div className="max-w-[160px] truncate" title={`${row.customer ?? ""} ${row.document ?? ""}`}>
          {row.customer || row.document || "—"}
        </div>
        {row.observation && (
          <div className="max-w-[160px] truncate text-[11px] text-slate-400" title={row.observation}>
            {row.observation}
          </div>
        )}
      </td>
    </tr>
  );
}
