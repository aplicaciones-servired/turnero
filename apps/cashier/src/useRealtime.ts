import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import type { PresenceSnapshot, SnapshotDTO, TurnDTO } from "@turnero/shared";
import { API_URL, TOKEN_KEY } from "./api";
import { usePresence } from "./presence";

const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");

export function useRealtime(enabled = true) {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;

    const socket = io(`${SOCKET_URL}/realtime`, {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    const refreshAfterReconnect = () => {
      usePresence.getState().setConnected(true);
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

    const updatePresence = (snapshot: PresenceSnapshot) => {
      usePresence.getState().setSnapshot(snapshot);
    };

    const markDisconnected = () => {
      usePresence.getState().setConnected(false);
    };

    socket.on("connect", refreshAfterReconnect);
    socket.on("disconnect", markDisconnected);
    socket.on("connect_error", markDisconnected);
    socket.on("queue:updated", updateQueue);
    socket.on("turn:finished", removeFinishedTurn);
    socket.on("presence:updated", updatePresence);

    return () => {
      socket.off("connect", refreshAfterReconnect);
      socket.off("disconnect", markDisconnected);
      socket.off("connect_error", markDisconnected);
      socket.off("queue:updated", updateQueue);
      socket.off("turn:finished", removeFinishedTurn);
      socket.off("presence:updated", updatePresence);
      socket.disconnect();
      socketRef.current = null;
      usePresence.getState().reset();
    };
  }, [queryClient, enabled]);

  return socketRef;
}
