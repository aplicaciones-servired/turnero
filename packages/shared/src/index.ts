export type UserRole = "admin" | "cashier";

export type TurnStatus = "waiting" | "called" | "serving" | "finished" | "skipped";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  counterName?: string | null;
}

export interface UserDTO extends AuthUser {
  active: boolean;
  createdAt: string;
}

export interface ServiceDTO {
  id: string;
  name: string;
  prefix: string;
  active: boolean;
  order: number;
  color: string;
  printHeader: string | null;
  printFooter: string | null;
}

export interface ServiceTreeDTO extends ServiceDTO {
  children: ServiceDTO[];
}

export interface TurnDTO {
  id: string;
  number: number;
  code: string;
  status: TurnStatus;
  serviceId: string;
  serviceName?: string;
  servicePrefix?: string;
  counterId: string | null;
  counterName: string | null;
  createdAt: string;
  calledAt: string | null;
  finishedAt: string | null;
}

export interface SettingsDTO {
  businessName: string;
  ticketHeader: string;
  ticketFooter: string;
  announcePrefix: string;
  voiceRate: number;
  voicePitch: number;
  marquee: string;
  logo: string | null;
  voiceVolume: number;
}

export interface CallTurnPayload {
  turn: TurnDTO;
  counterName: string;
  announcement: string;
}

export interface SnapshotDTO {
  nowServing: TurnDTO[];
  waiting: TurnDTO[];
}

/** Mapa de eventos emitidos del servidor -> cliente */
export interface ServerToClientEvents {
  "turn:created": (turn: TurnDTO) => void;
  "turn:called": (payload: CallTurnPayload) => void;
  "turn:finished": (turn: TurnDTO) => void;
  "turn:skipped": (turn: TurnDTO) => void;
  "queue:updated": (snapshot: SnapshotDTO) => void;
}

/** Mapa de eventos emitidos del cliente -> servidor */
export interface ClientToServerEvents {
  "display:subscribe": () => void;
}

/** Convierte un codigo de turno (ej "A012") en texto hablado calmado */
export function buildAnnouncement(
  code: string,
  counterName: string,
  prefix = "Turno"
): string {
  const spoken = code
    .split("")
    .map((ch) => (/\d/.test(ch) ? ch : ch.toUpperCase()))
    .join(" ");
  return `${prefix} ${spoken}. Pase a ${counterName}, por favor.`;
}

/** Convierte el numero de turno (ej "A014") en tokens/audio */
export function codeToAudioTokens(code: string): string[] {
  const tokens: string[] = [];
  const prefix = code.replace(/[0-9]/g, "");
  if (prefix) tokens.push(`letra_${prefix.toLowerCase()}`);
  return tokens;
}
