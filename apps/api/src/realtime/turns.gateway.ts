import { Logger } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { JwtService } from "@nestjs/jwt";
import { Server, Socket } from "socket.io";
import type {
  AuthUser,
  CallTurnPayload,
  ClientToServerEvents,
  PresenceSnapshot,
  PresenceUser,
  ServerToClientEvents,
  SnapshotDTO,
  TurnDTO,
} from "@turnero/shared";
import { UsersService } from "../users/users.service";

const ADMIN_ROOM = "admins";

interface PresenceEntry {
  user: AuthUser;
  counterName: string | null;
  socketIds: Set<string>;
  connectedAt: Date;
}

interface SocketTokenPayload {
  sub?: string;
  counterName?: string | null;
}

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: "/realtime",
})
export class TurnsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger("Realtime");
  private readonly presence = new Map<string, PresenceEntry>();

  @WebSocketServer() server!: Server<ClientToServerEvents, ServerToClientEvents>;

  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService
  ) {}

  async handleConnection(client: Socket) {
    this.logger.log(`Cliente conectado: ${client.id}`);
    const token = this.extractToken(client);
    if (!token) return;

    try {
      const payload = await this.jwt.verifyAsync<SocketTokenPayload>(token);
      if (!payload.sub) return;
      const user = await this.users.findById(payload.sub);
      if (!user) return;

      client.data.user = user;
      const current = this.presence.get(user.id);
      if (current) {
        current.user = user;
        current.counterName = payload.counterName ?? user.counterName ?? null;
        current.socketIds.add(client.id);
      } else {
        this.presence.set(user.id, {
          user,
          counterName: payload.counterName ?? user.counterName ?? null,
          socketIds: new Set([client.id]),
          connectedAt: new Date(),
        });
      }

      if (user.role === "admin") client.join(ADMIN_ROOM);
      this.broadcastPresence();
    } catch {
      // Los sockets sin token valido (pantallas, kiosco) siguen funcionando
      // para la cola, pero no cuentan como cajeras conectadas.
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
    const user = client.data.user as AuthUser | undefined;
    if (!user) return;
    const entry = this.presence.get(user.id);
    if (!entry) return;
    entry.socketIds.delete(client.id);
    if (entry.socketIds.size === 0) this.presence.delete(user.id);
    this.broadcastPresence();
  }

  getPresence(): PresenceSnapshot {
    const entries = [...this.presence.values()];
    const cashiers: PresenceUser[] = entries
      .filter((entry) => entry.user.role === "cashier")
      .map((entry) => ({
        id: entry.user.id,
        username: entry.user.username,
        displayName: entry.user.displayName,
        role: entry.user.role,
        counterName: entry.counterName,
        connectedAt: entry.connectedAt.toISOString(),
        sessions: entry.socketIds.size,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    return {
      cashiers,
      total: cashiers.length,
      admins: entries.filter((entry) => entry.user.role === "admin").length,
      updatedAt: new Date().toISOString(),
    };
  }

  private broadcastPresence() {
    this.server.to(ADMIN_ROOM).emit("presence:updated", this.getPresence());
  }

  private extractToken(client: Socket): string | null {
    const auth = client.handshake.auth as { token?: unknown } | undefined;
    if (typeof auth?.token === "string" && auth.token) return auth.token;
    const header = client.handshake.headers.authorization;
    if (typeof header === "string" && header.startsWith("Bearer ")) {
      return header.slice(7);
    }
    const query = client.handshake.query.token;
    if (typeof query === "string" && query) return query;
    return null;
  }

  emitTurnCreated(turn: TurnDTO) {
    this.server.emit("turn:created", turn);
  }

  emitTurnCalled(payload: CallTurnPayload) {
    this.server.emit("turn:called", payload);
  }

  emitTurnFinished(turn: TurnDTO) {
    this.server.emit("turn:finished", turn);
  }

  emitTurnSkipped(turn: TurnDTO) {
    this.server.emit("turn:skipped", turn);
  }

  emitQueueUpdated(snapshot: SnapshotDTO) {
    this.server.emit("queue:updated", snapshot);
  }
}
