import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { CallTurnPayload, SettingsDTO, SnapshotDTO, TurnDTO } from "@turnero/shared";
import { api, SOCKET_URL } from "./api";
import { voice } from "./voice";

const emptySnapshot: SnapshotDTO = { nowServing: [], waiting: [] };

export default function App() {
  const [snapshot, setSnapshot] = useState<SnapshotDTO>(emptySnapshot);
  const [latest, setLatest] = useState<TurnDTO | null>(null);
  const [settings, setSettings] = useState<SettingsDTO | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [clock, setClock] = useState(new Date());
  const socketRef = useRef<Socket | null>(null);
  const settingsRef = useRef<SettingsDTO | null>(null);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    api.get<SettingsDTO>("/settings").then((r) => setSettings(r.data));
    api.get<SnapshotDTO>("/turns/snapshot").then((r) => setSnapshot(r.data));

    const socket = io(`${SOCKET_URL}/realtime`, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", async () => {
      const { data } = await api.get<SnapshotDTO>("/turns/snapshot");
      setSnapshot(data);
    });

    socket.on("queue:updated", (data: SnapshotDTO) => setSnapshot(data));

    socket.on("turn:called", (payload: CallTurnPayload) => {
      setLatest(payload.turn);
      const s = settingsRef.current;
      voice.announce(payload.announcement, {
        rate: s?.voiceRate ?? 0.85,
        pitch: s?.voicePitch ?? 1,
        volume: (s?.voiceVolume ?? 10) / 100,
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const enableAudio = () => {
    voice.prepare();
    setAudioEnabled(true);
    voice.announce("Sistema listo", { rate: 0.9, pitch: 1 });
  };

  if (!audioEnabled) {
    return (
      <button
        onClick={enableAudio}
        className="flex h-full w-full flex-col items-center justify-center gap-4 bg-slate-950 text-white"
      >
        <span className="text-6xl">🔊</span>
        <span className="text-2xl font-semibold">Toque para activar el sonido</span>
      </button>
    );
  }

  return (
    <div className="flex h-full flex-col bg-slate-950 text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-10 py-6">
        <h1 className="text-3xl font-bold">{settings?.businessName ?? "Turnos"}</h1>
        <span className="text-2xl font-medium text-slate-300">
          {clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </header>

      <main className="flex flex-1 overflow-hidden">
        <section className="flex flex-[3] flex-col p-8">
          <h2 className="mb-4 text-xl font-semibold uppercase tracking-wider text-slate-400">
            Llamando ahora
          </h2>
          <div className="grid flex-1 grid-cols-2 gap-6">
            {snapshot.nowServing.slice(0, 4).map((turn) => {
              const isLatest = latest?.id === turn.id;
              return (
                <div
                  key={turn.id}
                  className={`flex flex-col items-center justify-center rounded-3xl p-6 ${
                    isLatest ? "bg-emerald-500 animate-pulse" : "bg-white/10"
                  }`}
                >
                  <span className="text-8xl font-black tracking-wider">{turn.code}</span>
                  <span className="mt-2 text-2xl font-medium text-white/90">
                    {turn.counterName ?? "Caja"}
                  </span>
                </div>
              );
            })}
            {snapshot.nowServing.length === 0 && (
              <div className="col-span-2 flex items-center justify-center rounded-3xl bg-white/5 text-2xl text-slate-500">
                Esperando llamados
              </div>
            )}
          </div>
        </section>

        <aside className="w-96 border-l border-white/10 bg-black/30 p-8">
          <h2 className="mb-4 text-xl font-semibold uppercase tracking-wider text-slate-400">
            Siguientes
          </h2>
          <ul className="space-y-3">
            {snapshot.waiting.slice(0, 10).map((turn, i) => (
              <li
                key={turn.id}
                className="flex items-center justify-between rounded-2xl bg-white/5 px-5 py-4"
              >
                <span className="text-3xl font-bold">{turn.code}</span>
                <span className="text-right text-sm text-slate-400">
                  {turn.serviceName}
                  {i === 0 && <span className="block text-emerald-400">Siguiente</span>}
                </span>
              </li>
            ))}
            {snapshot.waiting.length === 0 && (
              <li className="py-10 text-center text-slate-500">Sin turnos en espera</li>
            )}
          </ul>
        </aside>
      </main>

      {settings?.marquee ? (
        <footer className="overflow-hidden border-t border-white/10 bg-black/40 py-3">
          <span className="marquee-track px-4 text-2xl text-amber-300">
            {settings.marquee}
          </span>
        </footer>
      ) : null}
    </div>
  );
}
