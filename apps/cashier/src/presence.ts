import { create } from "zustand";
import type { PresenceSnapshot } from "@turnero/shared";

interface PresenceState {
  snapshot: PresenceSnapshot | null;
  connected: boolean;
  setSnapshot: (snapshot: PresenceSnapshot) => void;
  setConnected: (connected: boolean) => void;
  reset: () => void;
}

export const usePresence = create<PresenceState>((set) => ({
  snapshot: null,
  connected: false,
  setSnapshot: (snapshot) => set({ snapshot }),
  setConnected: (connected) => set({ connected }),
  reset: () => set({ snapshot: null, connected: false }),
}));
