import axios from "axios";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";
export const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");
export const VOICE_MODE = import.meta.env.VITE_VOICE_MODE ?? "tts";

export const api = axios.create({ baseURL: API_URL, timeout: 15000 });
