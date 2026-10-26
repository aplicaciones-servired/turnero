import { usePresence } from "../../presence";
import { Card } from "../ui";
import { fmtTime } from "./utils";

export function PresencePanel() {
  const snapshot = usePresence((state) => state.snapshot);
  const connected = usePresence((state) => state.connected);
  const cashiers = snapshot?.cashiers ?? [];
  const count = snapshot?.total ?? 0;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              connected ? "animate-pulse bg-emerald-500" : "bg-slate-300"
            }`}
          />
          <h3 className="text-sm font-semibold text-slate-800">Cajeras conectadas</h3>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
            {snapshot ? count : "—"}
          </span>
        </div>
        <span className="text-xs text-slate-400">
          {!connected
            ? "Sin conexion en tiempo real"
            : snapshot
              ? `Actualizado ${fmtTime(snapshot.updatedAt)}`
              : "Cargando presencia..."}
        </span>
      </div>

      {connected && snapshot && cashiers.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {cashiers.map((cashier) => (
            <div
              key={cashier.id}
              className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700">
                {cashier.displayName.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-700">
                  {cashier.displayName}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {cashier.counterName || "Sin caja"} · desde {fmtTime(cashier.connectedAt)}
                  {cashier.sessions > 1 ? ` · ${cashier.sessions} sesiones` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          {!connected
            ? "Reconectando con el servidor..."
            : snapshot
              ? "No hay cajeras conectadas en este momento."
              : "Esperando datos del servidor..."}
        </p>
      )}

      {snapshot && snapshot.admins > 0 && (
        <p className="mt-2 text-[11px] text-slate-400">
          {snapshot.admins} administrador(es) conectado(s).
        </p>
      )}
    </Card>
  );
}
