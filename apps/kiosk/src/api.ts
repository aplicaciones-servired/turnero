import axios from "axios";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";

export const api = axios.create({ baseURL: API_URL, timeout: 15000 });
