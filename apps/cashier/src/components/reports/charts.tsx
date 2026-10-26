import type { ReactNode } from "react";
import { CHART_COLORS } from "./utils";

export function ChartCard({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function Kpi({
  label,
  value,
  hint,
  tone = "slate",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "slate" | "blue" | "green" | "amber" | "red" | "violet";
}) {
  const tones: Record<string, string> = {
    slate: "border-slate-200 bg-white",
    blue: "border-blue-200 bg-blue-50/60",
    green: "border-emerald-200 bg-emerald-50/60",
    amber: "border-amber-200 bg-amber-50/60",
    red: "border-red-200 bg-red-50/60",
    violet: "border-violet-200 bg-violet-50/60",
  };
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${tones[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function BarList({
  data,
  max,
  format = (value) => String(value),
  emptyText = "Sin datos",
}: {
  data: Array<{ label: string; value: number; hint?: string; color?: string }>;
  max?: number;
  format?: (value: number) => string;
  emptyText?: string;
}) {
  if (data.length === 0) return <EmptyState text={emptyText} />;
  const top = max ?? Math.max(...data.map((row) => row.value), 1);
  return (
    <div className="space-y-3">
      {data.map((row, index) => {
        const pct = top > 0 ? Math.max(1, (row.value / top) * 100) : 0;
        const color = row.color ?? CHART_COLORS[index % CHART_COLORS.length];
        return (
          <div key={`${row.label}-${index}`} title={`${row.label}: ${format(row.value)}`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span className="truncate font-medium text-slate-600">{row.label}</span>
              <span className="shrink-0 font-semibold text-slate-800">
                {format(row.value)}
                {row.hint && <span className="ml-1 font-normal text-slate-400">{row.hint}</span>}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Donut({
  data,
  centerLabel,
  format = (value) => String(value),
}: {
  data: Array<{ label: string; value: number; color?: string }>;
  centerLabel?: string;
  format?: (value: number) => string;
}) {
  const rows = data.filter((row) => row.value > 0);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  if (total === 0) return <EmptyState text="Sin datos para el periodo" />;

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 160 160" className="h-40 w-40 -rotate-90">
          <circle cx="80" cy="80" r={radius} fill="none" stroke="#f1f5f9" strokeWidth="18" />
          {rows.map((row, index) => {
            const length = (row.value / total) * circumference;
            const dash = `${Math.max(0, length - 2)} ${circumference - Math.max(0, length - 2)}`;
            const element = (
              <circle
                key={row.label}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={row.color ?? CHART_COLORS[index % CHART_COLORS.length]}
                strokeWidth="18"
                strokeDasharray={dash}
                strokeDashoffset={-offset}
              >
                <title>{`${row.label}: ${format(row.value)}`}</title>
              </circle>
            );
            offset += length;
            return element;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-slate-900">{format(total)}</span>
          <span className="text-[11px] text-slate-500">{centerLabel ?? "Total"}</span>
        </div>
      </div>
      <div className="min-w-[160px] flex-1 space-y-2">
        {rows.map((row, index) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2 text-slate-600">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: row.color ?? CHART_COLORS[index % CHART_COLORS.length] }}
              />
              <span className="truncate">{row.label}</span>
            </span>
            <span className="shrink-0 font-semibold text-slate-800">{format(row.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LineChart({
  labels,
  series,
  format = (value) => String(value),
  xFormat = (value: string) => value,
}: {
  labels: string[];
  series: Array<{ name: string; color?: string; values: number[] }>;
  format?: (value: number) => string;
  xFormat?: (value: string) => string;
}) {
  if (labels.length === 0 || series.length === 0) {
    return <EmptyState text="Sin datos para el periodo" />;
  }

  const width = 800;
  const height = 230;
  const padding = { left: 42, right: 12, top: 14, bottom: 28 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const max = Math.max(1, ...series.flatMap((row) => row.values));
  const xAt = (index: number) =>
    labels.length === 1
      ? padding.left + plotWidth / 2
      : padding.left + (index / (labels.length - 1)) * plotWidth;
  const yAt = (value: number) => padding.top + plotHeight - (value / max) * plotHeight;
  const step = Math.max(1, Math.ceil(labels.length / 8));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {series.map((row, index) => (
          <span key={row.name} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: row.color ?? CHART_COLORS[index % CHART_COLORS.length] }}
            />
            {row.name}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = Math.round(max * ratio);
          const y = yAt(value);
          return (
            <g key={ratio}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                stroke="#e2e8f0"
                strokeDasharray={ratio === 0 ? undefined : "3 3"}
              />
              <text x={padding.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8">
                {format(value)}
              </text>
            </g>
          );
        })}
        {labels.map((label, index) =>
          index % step === 0 || index === labels.length - 1 ? (
            <text
              key={`${label}-${index}`}
              x={xAt(index)}
              y={height - 8}
              textAnchor="middle"
              fontSize="9"
              fill="#94a3b8"
            >
              {xFormat(label)}
            </text>
          ) : null
        )}
        {series.map((row, index) => {
          const color = row.color ?? CHART_COLORS[index % CHART_COLORS.length];
          const points = row.values
            .map((value, position) => `${xAt(position)},${yAt(value)}`)
            .join(" ");
          return (
            <g key={row.name}>
              <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
              {labels.length <= 31 &&
                row.values.map((value, position) => (
                  <circle
                    key={`${row.name}-${position}`}
                    cx={xAt(position)}
                    cy={yAt(value)}
                    r="3"
                    fill="#fff"
                    stroke={color}
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  >
                    <title>{`${row.name} ${labels[position]}: ${format(value)}`}</title>
                  </circle>
                ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const WEEKDAYS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

export function Heatmap({
  cells,
  max,
  format = (value) => String(value),
}: {
  cells: Array<{ weekday: number; hour: number; count: number }>;
  max: number;
  format?: (value: number) => string;
}) {
  if (cells.length === 0) return <EmptyState text="Sin datos para el periodo" />;
  const map = new Map(cells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell.count]));
  const top = Math.max(1, max);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-[42px_repeat(24,minmax(0,1fr))] gap-1">
          <div />
          {Array.from({ length: 24 }, (_, hour) => (
            <div key={hour} className="text-center text-[9px] text-slate-400">
              {hour % 2 === 0 ? String(hour).padStart(2, "0") : ""}
            </div>
          ))}
          {WEEKDAYS.map((day, weekday) => (
            <div key={day} className="contents">
              <div className="flex items-center text-[10px] font-medium text-slate-500">{day}</div>
              {Array.from({ length: 24 }, (_, hour) => {
                const count = map.get(`${weekday}-${hour}`) ?? 0;
                const ratio = count / top;
                return (
                  <div
                    key={`${weekday}-${hour}`}
                    title={`${day} ${String(hour).padStart(2, "0")}:00 — ${format(count)}`}
                    className="h-6 rounded-sm ring-1 ring-inset ring-white/60"
                    style={{
                      backgroundColor:
                        count === 0
                          ? "#f8fafc"
                          : `rgba(37, 99, 235, ${0.12 + ratio * 0.88})`,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-slate-400">
        <span>Menos</span>
        {[0.12, 0.32, 0.52, 0.72, 0.92].map((ratio) => (
          <span
            key={ratio}
            className="h-3 w-5 rounded-sm"
            style={{ backgroundColor: `rgba(37, 99, 235, ${ratio})` }}
          />
        ))}
        <span>Mas</span>
      </div>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-[80px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-400">
      {text}
    </div>
  );
}

export function LoadingBlock() {
  return (
    <div className="flex min-h-[160px] items-center justify-center text-sm text-slate-400">
      Cargando reporte...
    </div>
  );
}
