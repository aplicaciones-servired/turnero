import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ServiceTreeDTO, UserDTO } from "@turnero/shared";
import { api } from "../api";
import { Alert, Button, Card, PageHeader, errorMessage } from "./ui";
import { SummaryReport } from "./reports/SummaryReport";
import { TurnsReport } from "./reports/TurnsReport";
import { TimesReport } from "./reports/TimesReport";
import { AbsenteeismReport } from "./reports/AbsenteeismReport";
import { AgentsReport } from "./reports/AgentsReport";
import { CallsReport } from "./reports/CallsReport";
import { DemandReport } from "./reports/DemandReport";
import { RatingsReport } from "./reports/RatingsReport";
import { monthRange, shiftDay, todayLima, type ReportFilters } from "./reports/utils";

type ReportTab =
  | "summary"
  | "turns"
  | "times"
  | "absenteeism"
  | "agents"
  | "calls"
  | "demand"
  | "ratings";

const TABS: Array<{ id: ReportTab; label: string }> = [
  { id: "summary", label: "Resumen" },
  { id: "turns", label: "Turnos" },
  { id: "times", label: "Tiempos" },
  { id: "absenteeism", label: "Ausentismo" },
  { id: "agents", label: "Productividad" },
  { id: "calls", label: "Llamados por cajera" },
  { id: "demand", label: "Demanda" },
  { id: "ratings", label: "Calificaciones" },
];

type Preset = "today" | "yesterday" | "last7" | "month" | "lastMonth" | "custom";

const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: "today", label: "Hoy" },
  { id: "yesterday", label: "Ayer" },
  { id: "last7", label: "Ultimos 7 dias" },
  { id: "month", label: "Este mes" },
  { id: "lastMonth", label: "Mes anterior" },
];

function daysBetween(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function AdminReports() {
  const today = todayLima();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [preset, setPreset] = useState<Preset>("today");
  const [serviceId, setServiceId] = useState("");
  const [tab, setTab] = useState<ReportTab>("summary");
  const queryClient = useQueryClient();

  const { data: meta, error: metaError } = useQuery({
    queryKey: ["reports", "meta"],
    queryFn: async () => {
      const [services, users] = await Promise.all([
        api.get<ServiceTreeDTO[]>("/services?active=false"),
        api.get<UserDTO[]>("/users"),
      ]);
      const flat: Array<{ id: string; name: string }> = [];
      for (const service of services.data) {
        flat.push({ id: service.id, name: service.name });
        for (const child of service.children) {
          flat.push({ id: child.id, name: `${service.name} / ${child.name}` });
        }
      }
      flat.sort((a, b) => a.name.localeCompare(b.name));
      const people = users.data
        .map((user) => ({ id: user.id, name: user.displayName || user.username }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return { services: flat, users: people };
    },
    staleTime: 5 * 60_000,
  });

  const applyPreset = (next: Preset) => {
    setPreset(next);
    if (next === "today") {
      setFrom(today);
      setTo(today);
      return;
    }
    if (next === "yesterday") {
      const day = shiftDay(today, -1);
      setFrom(day);
      setTo(day);
      return;
    }
    if (next === "last7") {
      setFrom(shiftDay(today, -6));
      setTo(today);
      return;
    }
    if (next === "month") {
      const range = monthRange(0);
      setFrom(range.from);
      setTo(range.to);
      return;
    }
    if (next === "lastMonth") {
      const range = monthRange(-1);
      setFrom(range.from);
      setTo(range.to);
    }
  };

  const filters: ReportFilters = useMemo(
    () => ({
      from,
      to,
      serviceId: serviceId ? Number(serviceId) : undefined,
    }),
    [from, to, serviceId]
  );

  const invalidRange = !from || !to || from > to;
  const tooLong = !invalidRange && daysBetween(from, to) > 366;
  const valid = !invalidRange && !tooLong;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-6">
      <PageHeader
        title="Reportes"
        subtitle="Indicadores de turnos, tiempos, ausentismo, demanda y calificaciones. Solo visible para administradores."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["reports"] })}
            >
              Actualizar
            </Button>
          </div>
        }
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((option) => (
              <button
                key={option.id}
                onClick={() => applyPreset(option.id)}
                className={
                  preset === option.id
                    ? "rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm"
                    : "rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                }
              >
                {option.label}
              </button>
            ))}
          </div>

          <label className="text-xs font-medium text-slate-500">
            Desde
            <input
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPreset("custom");
              }}
              className="input mt-1 w-40"
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Hasta
            <input
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPreset("custom");
              }}
              className="input mt-1 w-40"
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            Servicio
            <select
              value={serviceId}
              onChange={(event) => setServiceId(event.target.value)}
              className="input mt-1 w-56"
            >
              <option value="">Todos los servicios</option>
              {meta?.services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>
          {valid && (
            <span className="pb-2 text-xs text-slate-400">
              {daysBetween(from, to)} dia(s) de informacion
            </span>
          )}
        </div>
      </Card>

      <div className="flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={
              tab === item.id
                ? "whitespace-nowrap rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white"
                : "whitespace-nowrap rounded-lg px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
            }
          >
            {item.label}
          </button>
        ))}
      </div>

      {invalidRange && <Alert tone="error">La fecha final no puede ser menor que la inicial.</Alert>}
      {tooLong && <Alert tone="error">El rango maximo es de 366 dias.</Alert>}
      {metaError && (
        <Alert tone="error">
          {errorMessage(metaError, "No se pudieron cargar servicios y usuarios.")}
        </Alert>
      )}

      {valid && tab === "summary" && <SummaryReport filters={filters} />}
      {valid && tab === "turns" && <TurnsReport filters={filters} users={meta?.users ?? []} />}
      {valid && tab === "times" && <TimesReport filters={filters} />}
      {valid && tab === "absenteeism" && <AbsenteeismReport filters={filters} />}
      {valid && tab === "agents" && <AgentsReport filters={filters} />}
      {valid && tab === "calls" && <CallsReport filters={filters} users={meta?.users ?? []} />}
      {valid && tab === "demand" && <DemandReport filters={filters} />}
      {valid && tab === "ratings" && <RatingsReport filters={filters} users={meta?.users ?? []} />}
    </div>
  );
}
