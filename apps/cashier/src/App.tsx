import { useEffect, useState } from "react";
import { useAuth } from "./auth";
import { useRealtime } from "./useRealtime";
import { Login } from "./components/Login";
import { CallPanel } from "./components/CallPanel";
import { AdminTurns } from "./components/AdminTurns";
import { AdminServices } from "./components/AdminServices";
import { AdminSettings } from "./components/AdminSettings";
import { AdminDisplay } from "./components/AdminDisplay";
import { AdminUsers } from "./components/AdminUsers";
import { AdminReports } from "./components/AdminReports";

type Tab =
  | "call"
  | "turns"
  | "reports"
  | "services"
  | "settings"
  | "display"
  | "users";

const ICONS: Record<Tab, string> = {
  call: "M11.3 1.046A1 1 0 0 1 12 2v5h4a1 1 0 0 1 .82 1.573l-7 10A1 1 0 0 1 8 18v-5H4a1 1 0 0 1-.82-1.573l7-10Z",
  turns: "M3 4a1 1 0 0 1 1-1h12a1 1 0 0 1 0 2H4a1 1 0 0 1-1-1Zm0 6a1 1 0 0 1 1-1h12a1 1 0 0 1 0 2H4a1 1 0 0 1-1-1Zm0 6a1 1 0 0 1 1-1h8a1 1 0 0 1 0 2H4a1 1 0 0 1-1-1Z",
  reports:
    "M2 16.5a.75.75 0 0 1 .75-.75h1.5V9a.75.75 0 0 1 1.5 0v6.75h1.5V5a.75.75 0 0 1 1.5 0v10.75h1.5V7.5a.75.75 0 0 1 1.5 0v8.25h1.5V3a.75.75 0 0 1 1.5 0v13.25h1.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 16.5Z",
  services: "M3 4.5A1.5 1.5 0 0 1 4.5 3h11A1.5 1.5 0 0 1 17 4.5v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15.5v-11Zm2 .5v3h4V5H5Zm6 0v3h4V5h-4ZM5 10v4h4v-4H5Zm6 0v4h4v-4h-4Z",
  settings: "M9.5 2a1 1 0 0 1 1 1v.5a6.5 6.5 0 0 1 1.6.66l.35-.35a1 1 0 1 1 1.42 1.42l-.35.35c.3.5.52 1.04.66 1.6H15a1 1 0 1 1 0 2h-.5a6.5 6.5 0 0 1-.66 1.6l.35.35a1 1 0 0 1-1.42 1.42l-.35-.35a6.5 6.5 0 0 1-1.6.66v.5a1 1 0 1 1-2 0v-.5a6.5 6.5 0 0 1-1.6-.66l-.35.35A1 1 0 0 1 5.5 12.6l.35-.35A6.5 6.5 0 0 1 5.2 10.6H4.7a1 1 0 1 1 0-2h.5c.14-.56.36-1.1.66-1.6l-.35-.35A1 1 0 0 1 6.93 4.4l.35.35c.5-.3 1.04-.52 1.6-.66V3a1 1 0 0 1 .62-1Zm.5 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z",
  display: "M3 4.5A1.5 1.5 0 0 1 4.5 3h11A1.5 1.5 0 0 1 17 4.5v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 12.5v-8ZM7 16a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2H7Z",
  users: "M7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6.5.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2 15.5C2 13 4.24 11 7 11s5 2 5 4.5V17H2v-1.5Zm12 1.5v-1c0-1-.3-1.94-.83-2.72.42-.18.88-.28 1.33-.28 2.02 0 3.5 1.34 3.5 3V17h-4Z",
};

const ADMIN_TABS: { id: Tab; label: string }[] = [
  { id: "call", label: "Llamados" },
  { id: "turns", label: "Turnos" },
  { id: "reports", label: "Reportes" },
  { id: "services", label: "Servicios" },
  { id: "users", label: "Usuarios" },
  { id: "settings", label: "Impresion" },
  { id: "display", label: "Pantalla (APK)" },
];

function TabIcon({ id, className }: { id: Tab; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d={ICONS[id]} />
    </svg>
  );
}

export default function App() {
  const { user, ready, restore, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("call");
  useRealtime();

  useEffect(() => {
    restore();
  }, [restore]);

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">Cargando...</div>
    );
  }

  if (!user) return <Login />;

  const isAdmin = user.role === "admin";

  return (
    <div className="flex min-h-full flex-col bg-slate-100">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-3.5 text-white shadow-md">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-lg font-black shadow-sm">
            T
          </span>
          <div className="leading-tight">
            <p className="text-base font-bold">Turnero</p>
            <p className="text-[11px] text-slate-400">
              {isAdmin ? "Panel de administracion" : "Panel de llamados"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="hidden text-right sm:block">
            <p className="font-medium text-slate-100">{user.displayName}</p>
            <p className="text-[11px] uppercase tracking-wide text-slate-400">
              {isAdmin ? "Administrador" : "Asesor"}
            </p>
          </div>
          <span
            className={
              isAdmin
                ? "flex h-9 w-9 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-200 ring-1 ring-blue-400/40"
                : "flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-bold text-emerald-200 ring-1 ring-emerald-400/40"
            }
          >
            {(user.displayName || user.username).slice(0, 2).toUpperCase()}
          </span>
          <button
            onClick={logout}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm font-medium hover:bg-white/15"
          >
            Salir
          </button>
        </div>
      </header>

      {isAdmin && (
        <nav className="sticky top-[61px] z-10 flex gap-1 overflow-x-auto border-b border-slate-200 bg-white/95 px-6 backdrop-blur">
          {ADMIN_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? "flex items-center gap-2 whitespace-nowrap border-b-2 border-blue-600 px-4 py-3 text-sm font-semibold text-blue-700"
                  : "flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm font-medium text-slate-500 hover:text-slate-800"
              }
            >
              <TabIcon
                id={t.id}
                className={tab === t.id ? "h-4 w-4 text-blue-600" : "h-4 w-4 text-slate-400"}
              />
              {t.label}
            </button>
          ))}
        </nav>
      )}

      <main className="flex-1">
        {!isAdmin && <CallPanel />}
        {isAdmin && tab === "call" && <CallPanel />}
        {isAdmin && tab === "turns" && <AdminTurns />}
        {isAdmin && tab === "reports" && <AdminReports />}
        {isAdmin && tab === "services" && <AdminServices />}
        {isAdmin && tab === "settings" && <AdminSettings />}
        {isAdmin && tab === "display" && <AdminDisplay />}
        {isAdmin && tab === "users" && <AdminUsers />}
      </main>
    </div>
  );
}
