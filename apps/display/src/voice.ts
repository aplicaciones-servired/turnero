import { VOICE_MODE } from "./api";

/** Reproduce un tono suave de aviso (dos notas ascendentes, volumen bajo). */
export function playChime(): Promise<void> {
  return new Promise((resolve) => {
    try {
      const Ctx = window.AudioContext || (window as never as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const now = ctx.currentTime;
      const notes = [660, 880];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        const start = now + i * 0.22;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.18, start + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.42);
      });
      setTimeout(() => {
        ctx.close();
        resolve();
      }, 900);
    } catch {
      resolve();
    }
  });
}

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
}

/** Selecciona una voz en espanol (prefiere una voz femenina y clara). */
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const spanish = voices.filter((v) => v.lang.toLowerCase().startsWith("es"));
  const pool = spanish.length ? spanish : voices;
  const preferred = pool.find((v) =>
    /mónica|monica|helena|paulina|female|mujer|sabina|google español/i.test(v.name)
  );
  return preferred ?? pool[0] ?? null;
}

export class Voice {
  private voice: SpeechSynthesisVoice | null = null;

  prepare() {
    if (!("speechSynthesis" in window)) return;
    const load = () => {
      this.voice = pickVoice();
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
  }

  private async playClips(text: string): Promise<void> {
    const words = text
      .toLowerCase()
      .replace(/[.,]/g, "")
      .split(/\s+/)
      .filter(Boolean);
    for (const word of words) {
      await new Promise<void>((resolve) => {
        const audio = new Audio(`/audio/${word}.mp3`);
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => resolve());
      });
    }
  }

  private speakTts(text: string, opts: SpeakOptions): Promise<void> {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) return resolve();
      const utter = new SpeechSynthesisUtterance(text);
      if (this.voice) utter.voice = this.voice;
      utter.lang = this.voice?.lang ?? "es-ES";
      utter.rate = opts.rate ?? 0.85;
      utter.pitch = opts.pitch ?? 1;
      utter.volume = opts.volume ?? 1;
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    });
  }

  /** Anuncia un turno: suena un aviso suave y luego la voz calmada. */
  async announce(text: string, opts: SpeakOptions = {}): Promise<void> {
    await playChime();
    if (VOICE_MODE === "clips") {
      await this.playClips(text);
    } else {
      await this.speakTts(text, opts);
    }
  }
}

export const voice = new Voice();
