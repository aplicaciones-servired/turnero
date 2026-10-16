/// <reference types="vite/client" />

/**
 * Puente que inyecta el APK (MainActivity.java) como window.AndroidTTS.
 * Android TV no trae el Web Speech API, así que la voz usa el TTS nativo.
 */
export interface AndroidTtsBridge {
  /** true si el equipo tiene motor de voz instalado. */
  disponible(): boolean;
  /** Habla y avisa a la página al terminar mediante window.__turneroTtsDone(id). */
  speak(id: string, text: string, rate: number, pitch: number): void;
  /** Dos notas ascendentes de aviso. */
  chime(): void;
}

declare global {
  interface Window {
    AndroidTTS?: AndroidTtsBridge;
    __turneroTtsDone?: (id: string) => void;
  }
}
