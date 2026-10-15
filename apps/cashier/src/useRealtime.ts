import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import type { SnapshotDTO, TurnDTO } from "@turnero/shared";
import { API_URL } from "./api";

const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");

export function useRealtime() {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(`${SOCKET_URL}/realtime`, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    const refreshAfterReconnect = () => {
      void queryClient.invalidateQueries({ queryKey: ["snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["turns"] });
    };

    const updateQueue = (snapshot: SnapshotDTO) => {
      queryClient.setQueryData(["snapshot"], snapshot);
      void queryClient.invalidateQueries({ queryKey: ["turns"] });
    };

    const removeFinishedTurn = (turn: TurnDTO) => {
      queryClient.setQueryData<SnapshotDTO>(["snapshot"], (snapshot) =>
        snapshot
          ? { ...snapshot, nowServing: snapshot.nowServing.filter((item) => item.id !== turn.id) }
          : snapshot
      );
      void queryClient.invalidateQueries({ queryKey: ["turns"] });
    };

    socket.on("connect", refreshAfterReconnect);
    socket.on("queue:updated", updateQueue);
    socket.on("turn:finished", removeFinishedTurn);

    return () => {
      socket.off("connect", refreshAfterReconnect);
      socket.off("queue:updated", updateQueue);
      socket.off("turn:finished", removeFinishedTurn);
      socket.disconnect();
    };
  }, [queryClient]);

  return socketRef;
}
