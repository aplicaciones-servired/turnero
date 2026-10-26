import type { ReportTurnStatus } from "@turnero/shared";

export interface ReportFilters {
  from: string;
  to: string;
  serviceId?: number;
  userId?: number;
  status?: ReportTurnStatus;
}

export const CHART_COLORS = [
  "#2563eb",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#64748b",
  "#ec4899",
];

export function todayLima(): string {
  const now = new Date(Date.now() - 5 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

export function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function monthRange(offset = 0): { from: string; to: string } {
  const today = todayLima();
  const [year, month] = today.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1 + offset, 1));
  const end = new Date(Date.UTC(year, month + offset, 0));
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const value = Math.max(0, Math.round(seconds));
  if (value < 60) return `${value}s`;
  const minutes = Math.floor(value / 60);
  if (minutes < 60) return `${minutes}m ${value % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)}%`;
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("es-CO", {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("es-CO", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDay(value: string): string {
  const [, month, day] = value.split("-");
  return `${day}/${month}`;
}

export function fmtHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export const TURN_STATUS_LABEL: Record<string, string> = {
  NORMAL: "Pendiente",
  TERMINADO: "Atendido",
  AUSENTE: "Ausente",
  TRANSFERIDO: "Transferido",
  CANCELADO: "Cancelado",
};

export function turnStatusLabel(status: string, observation: string | null): string {
  if (observation === "TRANSFERIDO") return "Transferido";
  return TURN_STATUS_LABEL[status] ?? status ?? "—";
}

export function turnStatusClasses(status: string, observation: string | null): string {
  if (observation === "TRANSFERIDO") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (status === "TERMINADO") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "AUSENTE") return "bg-red-50 text-red-700 ring-red-200";
  if (status === "CANCELADO") return "bg-slate-100 text-slate-600 ring-slate-200";
  return "bg-blue-50 text-blue-700 ring-blue-200";
}

export function cleanParams<T extends object>(filters: T): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "") continue;
    params[key] = value as string | number;
  }
  return params;
}
