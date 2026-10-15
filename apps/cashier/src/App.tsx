import { useEffect, useState } from "react";
import { useAuth } from "./auth";
import { useRealtime } from "./useRealtime";
import { Login } from "./components/Login";
import { CallPanel } from "./components/CallPanel";
import { AdminTurns } from "./components/AdminTurns";
import { AdminServices } from "./components/AdminServices";
import { AdminSettings } from "./components/AdminSettings";
import { AdminUsers } from "./components/AdminUsers";

type Tab = "call" | "turns" | "services" | "settings" | "users";

const ADMIN_TABS: { id: Tab; label: string }[] = [
  { id: "call", label: "Llamados" },
  { id: "turns", label: "Todos los turnos" },
  { id: "services", label: "Servicios" },
  { id: "settings", label: "Impresion y voz" },
  { id: "users", label: "Usuarios" },
];

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
      <header className="flex items-center justify-between bg-slate-900 px-6 py-4 text-white">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold">Turnero</span>
          <span
            className={
              isAdmin
                ? "rounded bg-blue-500/20 px-2 py-0.5 text-xs text-blue-200"
                : "rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-200"
            }
          >
            {isAdmin ? "Administrador" : "Cajera"}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-slate-300">{user.displayName}</span>
          <button
            onClick={logout}
            className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20"
          >
            Salir
          </button>
        </div>
      </header>

      {isAdmin && (
        <nav className="flex gap-1 border-b border-slate-200 bg-white px-6">
          {ADMIN_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={
                tab === t.id
                  ? "border-b-2 border-blue-600 px-4 py-3 text-sm font-semibold text-blue-700"
                  : "px-4 py-3 text-sm font-medium text-slate-500 hover:text-slate-800"
              }
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}

      <main className="flex-1">
        {!isAdmin && <CallPanel />}
        {isAdmin && tab === "call" && <CallPanel />}
        {isAdmin && tab === "turns" && <AdminTurns />}
        {isAdmin && tab === "services" && <AdminServices />}
        {isAdmin && tab === "settings" && <AdminSettings />}
        {isAdmin && tab === "users" && <AdminUsers />}
      </main>
    </div>
  );
}
