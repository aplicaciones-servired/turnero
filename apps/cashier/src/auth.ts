import { create } from "zustand";
import type { AuthUser } from "@turnero/shared";
import { api, TOKEN_KEY } from "./api";

interface LoginResponse {
  token: string;
  user: AuthUser & { counterName: string | null };
}

interface AuthState {
  user: LoginResponse["user"] | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  restore: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,

  login: async (username, password) => {
    const { data } = await api.post<LoginResponse>("/auth/login", { username, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    set({ user: data.user });
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    set({ user: null });
  },

  restore: async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      set({ ready: true, user: null });
      return;
    }
    try {
      const { data } = await api.get<AuthUser>("/auth/me");
      set({ user: { ...data, counterName: null }, ready: true });
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      set({ user: null, ready: true });
    }
  },
}));
