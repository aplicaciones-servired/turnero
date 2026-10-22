import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ServiceDTO, ServiceTreeDTO, SettingsDTO, TurnDTO } from "@turnero/shared";
import { api, PRINT_AGENT_URL } from "./api";

interface GenerateResponse {
  turn: TurnDTO;
  printed: boolean;
  /** Ticket ESC/POS en base64 que el kiosco debe imprimir en su impresora local. */
  ticket?: string;
}

/**
 * Envia el ticket a la impresora local del kiosco (agente PrintAgent.ps1 en modo local),
 * replicando como el turnero master imprimia desde el propio kiosco (Impresion.php).
 */
async function printLocally(b64: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${PRINT_AGENT_URL}/print`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ b64 }),
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
    return json.ok !== false;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

export default function App() {
  const [expanded, setExpanded] = useState<ServiceTreeDTO | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const resetTimer = useRef<number | null>(null);

  const servicesQuery = useQuery({
    queryKey: ["services"],
    queryFn: async () => (await api.get<ServiceTreeDTO[]>("/services?active=true")).data,
  });

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await api.get<SettingsDTO>("/settings")).data,
  });

  useEffect(() => {
    return () => {
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
    };
  }, []);

  const scheduleReset = () => {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => {
      setResult(null);
      setExpanded(null);
      setError(null);
    }, 5000);
  };

  const pickService = (service: ServiceTreeDTO) => {
    if (loading) return;
    setError(null);
    if (service.children.length > 0) {
      setExpanded(service);
    } else {
      void generate(service);
    }
  };

  const generate = async (service: ServiceDTO) => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post<GenerateResponse>("/turns", { serviceId: service.id });
      let printed = data.printed;
      if (data.ticket) {
        printed = await printLocally(data.ticket);
      }
      setResult({ ...data, printed });
      setExpanded(null);
      scheduleReset();
    } catch {
      setError("No se pudo generar el turno. Intente nuevamente.");
    } finally {
      setLoading(false);
    }
  };

  const businessName = 'GRUPO EMPRESARIAL SERVIRED';

  if (result) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-emerald-600 text-white">
        <p className="text-2xl font-medium opacity-90">Su turno es</p>
        <p className="my-6 text-[12rem] font-black leading-none tracking-wider">
          {result.turn.code}
        </p>
        <p className="text-xl opacity-90">{result.turn.serviceName}</p>
        <p className="mt-6 text-sm opacity-80">
          {result.printed ? "Su ticket fue impreso." : "Tome su ticket impreso."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-slate-100">
      <header className="bg-slate-900 px-8 py-6 text-center text-white">
        <h1 className="text-3xl font-bold">{businessName}</h1>
        <p className="mt-1 text-lg text-slate-300">Seleccione el servicio que necesita</p>
        {error && <p className="mt-2 text-lg text-red-300">{error}</p>}
      </header>

      <main className="flex flex-1 items-center justify-center p-8">
        {servicesQuery.isLoading && <p className="text-xl text-slate-500">Cargando servicios...</p>}
        {servicesQuery.isError && (
          <p className="text-xl text-red-600">No se pudo cargar los servicios.</p>
        )}
        <div className="grid w-full max-w-6xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {servicesQuery.data?.map((service) => (
            <button
              key={service.id}
              onClick={() => pickService(service)}
              disabled={loading}
              className="flex h-52 flex-col items-center justify-center rounded-3xl bg-white text-left shadow-lg ring-1 ring-slate-200 transition active:scale-95 hover:shadow-xl disabled:opacity-60"
            >
              <span
                className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-black text-white"
                style={{ backgroundColor: service.color }}
              >
                {service.prefix}
              </span>
              <span className="px-4 text-center text-2xl font-semibold text-slate-800">
                {service.name}
              </span>
            </button>
          ))}
        </div>
      </main>

      {expanded && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 p-6">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-8 shadow-2xl">
            <h2 className="text-center text-2xl font-semibold text-slate-800">
              {expanded.name}
            </h2>
            <p className="mt-1 text-center text-slate-500">Elija una opcion</p>
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {expanded.children.map((child) => (
                <button
                  key={child.id}
                  onClick={() => {
                    setExpanded(null);
                    void generate(child);
                  }}
                  disabled={loading}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-left transition active:scale-95 hover:border-slate-300 hover:bg-white disabled:opacity-60"
                >
                  <span
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black text-white"
                    style={{ backgroundColor: child.color }}
                  >
                    {child.prefix}
                  </span>
                  <span className="text-lg font-semibold text-slate-800">{child.name}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setExpanded(null)}
              className="mt-8 w-full rounded-2xl bg-slate-200 py-4 text-lg font-semibold text-slate-700 active:scale-95"
            >
              Volver
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
