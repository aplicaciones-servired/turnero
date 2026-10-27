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
  // Impresion del ticket
  printWidth: number;
  printLogo: boolean;
  printLogoFile: string;
  printShowHeader: boolean;
  printShowService: boolean;
  printShowDate: boolean;
  printShowQr: boolean;
  printQrTemplate: string;
  printShowFooter: boolean;
  printTurnSize: string;
  printFeed: number;
  printCut: boolean;
  printOpenDrawer: boolean;
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

/** Usuario con al menos una sesion abierta en el turnero. */
export interface PresenceUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  counterName: string | null;
  connectedAt: string;
  sessions: number;
}

/** Presencia en vivo de las cajeras conectadas. */
export interface PresenceSnapshot {
  cashiers: PresenceUser[];
  total: number;
  admins: number;
  updatedAt: string;
}

/** Mapa de eventos emitidos del servidor -> cliente */
export interface ServerToClientEvents {
  "turn:created": (turn: TurnDTO) => void;
  "turn:called": (payload: CallTurnPayload) => void;
  "turn:finished": (turn: TurnDTO) => void;
  "turn:skipped": (turn: TurnDTO) => void;
  "queue:updated": (snapshot: SnapshotDTO) => void;
  "presence:updated": (snapshot: PresenceSnapshot) => void;
  "videos:updated": () => void;
}

/** Mapa de eventos emitidos del cliente -> servidor */
export interface ClientToServerEvents {
  "display:subscribe": () => void;
}

export interface ReportRange {
  from: string;
  to: string;
}

export type ReportTurnStatus =
  | "all"
  | "finished"
  | "absent"
  | "transferred"
  | "waiting"
  | "cancelled";

export interface ReportSummary {
  range: ReportRange;
  totals: {
    tickets: number;
    called: number;
    finished: number;
    absent: number;
    transferred: number;
    cancelled: number;
    waitingNow: number;
    deferredNow: number;
  };
  averages: {
    waitSec: number | null;
    attentionSec: number | null;
    totalSec: number | null;
  };
  rates: {
    absent: number;
    finished: number;
  };
  byHour: Array<{ hour: number; tickets: number; finished: number; absent: number }>;
  byDay: Array<{ date: string; tickets: number; finished: number; absent: number }>;
  byService: Array<{
    serviceId: number | null;
    name: string;
    tickets: number;
    finished: number;
    absent: number;
    transferred: number;
    waitAvgSec: number | null;
    attentionAvgSec: number | null;
  }>;
}

export interface ReportTurnRow {
  id: number;
  arrivedAt: string | null;
  calledAt: string | null;
  finishedAt: string | null;
  turn: string | null;
  serviceId: number | null;
  serviceName: string | null;
  userId: number | null;
  userName: string | null;
  status: string;
  observation: string | null;
  document: string | null;
  customer: string | null;
  calls: number;
  waitSec: number | null;
  attentionSec: number | null;
  totalSec: number | null;
}

export interface ReportTurnsPage {
  range: ReportRange;
  rows: ReportTurnRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ReportTimeRow {
  key: number | null;
  name: string;
  called: number;
  finished: number;
  absent: number;
  waitAvgSec: number | null;
  waitMedianSec: number | null;
  waitP90Sec: number | null;
  attentionAvgSec: number | null;
  attentionMedianSec: number | null;
  attentionP90Sec: number | null;
}

export interface ReportTimes {
  range: ReportRange;
  byService: ReportTimeRow[];
  byAgent: ReportTimeRow[];
}

export interface ReportAbsenteeismRow {
  key: number | null;
  name: string;
  total: number;
  absent: number;
  rate: number;
}

export interface ReportAbsenteeism {
  range: ReportRange;
  total: number;
  absent: number;
  rate: number;
  byService: ReportAbsenteeismRow[];
  byAgent: ReportAbsenteeismRow[];
  byHour: Array<{ hour: number; total: number; absent: number; rate: number }>;
}

export interface ReportAgentRow {
  userId: number;
  name: string;
  calls: number;
  finished: number;
  absent: number;
  transferred: number;
  waitAvgSec: number | null;
  attentionAvgSec: number | null;
  firstCallAt: string | null;
  lastCallAt: string | null;
}

export interface ReportAgents {
  range: ReportRange;
  rows: ReportAgentRow[];
}

export interface ReportCalls {
  range: ReportRange;
  total: number;
  rows: ReportAgentRow[];
  byDay: Array<{ date: string; calls: number }>;
}

export interface ReportDemand {
  range: ReportRange;
  total: number;
  max: number;
  cells: Array<{ weekday: number; hour: number; count: number }>;
}

export interface ReportRatingValue {
  value: string;
  count: number;
  pct: number;
}

export interface ReportRatingAgent {
  userId: number;
  name: string;
  total: number;
  values: ReportRatingValue[];
}

export interface ReportRatingQuestion {
  questionId: number | null;
  question: string;
  total: number;
  values: ReportRatingValue[];
}

export interface ReportRatings {
  range: ReportRange;
  total: number;
  byValue: ReportRatingValue[];
  byAgent: ReportRatingAgent[];
  byQuestion: ReportRatingQuestion[];
  byDay: Array<{ date: string; total: number }>;
}

export type ReportExportType =
  | "summary"
  | "turns"
  | "times"
  | "absenteeism"
  | "agents"
  | "calls"
  | "demand"
  | "ratings";

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
