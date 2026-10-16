import axios from "axios";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";
export const TOKEN_KEY = "turnero_token";
export const CAJA_KEY = "turnero_caja";

export const api = axios.create({ baseURL: API_URL, timeout: 15000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const url = error.config?.url ?? "";
    const isLogin = url.includes("/auth/login");
    if (error.response?.status === 401 && !isLogin) {
      localStorage.removeItem(TOKEN_KEY);
      if (!window.location.pathname.includes("login")) window.location.reload();
    }
    return Promise.reject(error);
  }
);
