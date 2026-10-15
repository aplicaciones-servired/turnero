import { Logger } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import type {
  CallTurnPayload,
  ClientToServerEvents,
  ServerToClientEvents,
  SnapshotDTO,
  TurnDTO,
} from "@turnero/shared";

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: "/realtime",
})
export class TurnsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger("Realtime");

  @WebSocketServer()
  server!: Server<ClientToServerEvents, ServerToClientEvents>;

  handleConnection(client: Socket) {
    this.logger.log(`Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
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
