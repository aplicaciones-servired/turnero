import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { API_URL } from "./api";

const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");

export function useRealtime() {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(`${SOCKET_URL}/realtime`, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["snapshot"] });
      queryClient.invalidateQueries({ queryKey: ["turns"] });
    };

    socket.on("turn:created", invalidate);
    socket.on("turn:called", invalidate);
    socket.on("turn:finished", invalidate);
    socket.on("turn:skipped", invalidate);
    socket.on("queue:updated", invalidate);

    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  return socketRef;
}
