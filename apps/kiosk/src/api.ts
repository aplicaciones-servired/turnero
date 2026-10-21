import axios from "axios";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001/api";

export const api = axios.create({ baseURL: API_URL, timeout: 15000 });

/**
 * Impresora local del kiosco (como el `Impresion.php` del turnero master).
 * El agente de impresion (PrintAgent.ps1, modo "local") escucha en la PC del kiosco.
 * Chrome permite llamar a http://localhost desde una pagina https.
 */
export const PRINT_AGENT_URL =
  import.meta.env.VITE_PRINT_AGENT_URL ?? "http://localhost:9110";
