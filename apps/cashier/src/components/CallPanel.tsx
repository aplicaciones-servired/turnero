import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SnapshotDTO } from "@turnero/shared";
import { api } from "../api";

type TurnAction = "call" | "recall" | "finish" | "skip";

const actionLabels: Record<TurnAction, string> = {
  call: "Llamar",
  recall: "Re-llamar",
  finish: "Finalizar",
  skip: "Pasar",
};

const actionPath: Record<TurnAction, string> = {
  call: "call",
  recall: "repeat",
  finish: "finish",
  skip: "absent",
};

export function CallPanel() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["snapshot"],
    queryFn: async () => (await api.get<SnapshotDTO>("/turns/snapshot")).data,
  });

  const act = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: TurnAction }) => {
      await api.post(`/turns/${id}/${actionPath[action]}`);
    },
    onMutate: async ({ id, action }) => {
      setPendingIds((current) => new Set(current).add(id));
      if (action === "finish") {
        await queryClient.cancelQueries({ queryKey: ["snapshot"] });
        queryClient.setQueryData<SnapshotDTO>(["snapshot"], (snapshot) =>
          snapshot
            ? { ...snapshot, nowServing: snapshot.nowServing.filter((turn) => turn.id !== id) }
            : snapshot
        );
      }
    },
    onSuccess: () => {
      setError(null);
    },
    onError: (err, { id, action }) => {
      void queryClient.invalidateQueries({ queryKey: ["snapshot"] });
      const e = err as { response?: { status?: number; data?: { message?: string | string[] } } };
      const status = e.response?.status;
      const msg = e.response?.data?.message;
      const detail = Array.isArray(msg) ? msg.join(", ") : msg;
      setError(
        status
          ? `No se pudo ${action === "finish" ? "finalizar" : "actualizar"} el turno ${id} (${status})${detail ? `: ${detail}` : "."}`
          : "No se pudo conectar con el servidor."
      );
    },
    onSettled: (_data, _error, { id }) => {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    },
  });

  const act2 = (id: string, action: TurnAction) => act.mutate({ id, action });

  if (isLoading) return <p className="p-8 text-slate-500">Cargando cola...</p>;

  return (
    <div className="grid gap-6 p-6 lg:grid-cols-2">
      {error && (
        <div className="lg:col-span-2 rounded-xl bg-red-50 px-4 py-3 text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}
      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">
          En espera ({data?.waiting.length ?? 0})
        </h2>
        <ul className="space-y-3">
          {data?.waiting.map((turn) => (
            <li
              key={turn.id}
              className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200"
            >
              <div>
                <span className="text-2xl font-black text-slate-800">{turn.code}</span>
                <span className="ml-3 text-sm text-slate-500">{turn.serviceName}</span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => act2(turn.id, "call")}
                  disabled={pendingIds.has(turn.id)}
                  className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {pendingIds.has(turn.id) ? "..." : actionLabels.call}
                </button>
                <button
                  onClick={() => act2(turn.id, "skip")}
                  disabled={pendingIds.has(turn.id)}
                  className="rounded-lg bg-slate-200 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-300 disabled:opacity-50"
                >
                  {actionLabels.skip}
                </button>
              </div>
            </li>
          ))}
          {data?.waiting.length === 0 && (
            <li className="py-8 text-center text-slate-400">No hay turnos en espera</li>
          )}
        </ul>
      </section>

      <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-4 text-lg font-semibold text-slate-800">Llamando ahora</h2>
        <ul className="space-y-3">
          {data?.nowServing.map((turn) => (
            <li
              key={turn.id}
              className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200"
            >
              <div>
                <span className="text-2xl font-black text-emerald-700">{turn.code}</span>
                <span className="ml-3 text-sm text-emerald-600">
                  {turn.counterName ?? "Caja"}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => act2(turn.id, "recall")}
                  disabled={pendingIds.has(turn.id)}
                  className="rounded-lg bg-amber-500 px-4 py-2 font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
                >
                  {actionLabels.recall}
                </button>
                <button
                  onClick={() => act2(turn.id, "finish")}
                  disabled={pendingIds.has(turn.id)}
                  className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {pendingIds.has(turn.id) ? "..." : actionLabels.finish}
                </button>
              </div>
            </li>
          ))}
          {data?.nowServing.length === 0 && (
            <li className="py-8 text-center text-slate-400">Nadie siendo atendido</li>
          )}
        </ul>
      </section>
    </div>
  );
}
