import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { AuthUser } from "@turnero/shared";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { TurnsService } from "./turns.service";
import { GenerateTurnDto } from "./dto/generate-turn.dto";
import {
  CallServiceDto,
  CallSpecificDto,
  FinishTurnDto,
  NoteDto,
  TransferTurnDto,
  UserStateDto,
} from "./dto/turn-actions.dto";

@Controller("turns")
export class TurnsController {
  constructor(private readonly turns: TurnsService) {}

  /** Kiosco: genera un turno y lo imprime. Publico (limitado por IP). */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post()
  generate(@Body() dto: GenerateTurnDto) {
    return this.turns.generate(dto.serviceId);
  }

  /** Pantalla y caja: estado actual de la cola. Publico. */
  @Get("snapshot")
  snapshot() {
    return this.turns.snapshot();
  }

  /** Contadores de cola del usuario (servicios asignados). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("cashier", "admin")
  @Get("count")
  count(@CurrentUser() user: AuthUser) {
    return this.turns.countByUser(user);
  }

  // ── Mando (caja) ──────────────────────────────────────────────

  /** Llamar: siguiente turno del usuario. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("cashier", "admin")
  @Post("call")
  call(@CurrentUser() user: AuthUser) {
    return this.turns.call(user);
  }

  /** Llamar siguiente turno de un servicio concreto. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("cashier", "admin")
  @Post("call-service")
  callService(@Body() dto: CallServiceDto, @CurrentUser() user: AuthUser) {
    return this.turns.callService(dto.ServiceId, user);
  }

  /** Enviar un turno concreto a todas las pantallas (Llamado especifico). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("cashier", "admin")
  @Post("specific")
  callSpecific(@Body() dto: CallSpecificDto) {
    return this.turns.callSpecific(dto.Turno, dto.Modulo);
  }

  /** Transferir un turno a otro servicio o usuario. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("cashier", "admin")
  @Post("transfer")
  transfer(@Body() dto: TransferTurnDto, @CurrentUser() user: AuthUser) {
    return this.turns.transfer(dto, user);
  }

  /** Cambiar el estado del asesor (DISPONIBLE/LLAMANDO/ATENDIENDO/CAJA CERRADA). */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("cashier", "admin")
  @Put("user-state")
  userState(@Body() dto: UserStateDto) {
    return this.turns.setUserState(dto.IdUsuario, dto.Estado);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("cashier", "admin")
  @Post(":id/call")
  callById(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.turns.callById(id, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("cashier", "admin")
  @Post(":id/repeat")
  repeat(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.turns.repeat(id, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("cashier", "admin")
  @Post(":id/finish")
  finish(
    @Param("id") id: string,
    @Body() dto: FinishTurnDto,
    @CurrentUser() user: AuthUser
  ) {
    return this.turns.finish(id, user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("cashier", "admin")
  @Post(":id/absent")
  absent(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.turns.absent(id, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("cashier", "admin")
  @Post(":id/defer")
  defer(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.turns.defer(id, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("cashier", "admin")
  @Post(":id/note")
  note(@Param("id") id: string, @Body() dto: NoteDto) {
    return this.turns.saveAdvisorNote(Number(id), dto.Observacion);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("cashier", "admin")
  @Post(":id/delay-note")
  delayNote(@Param("id") id: string, @Body() dto: NoteDto) {
    return this.turns.saveDelayNote(Number(id), dto.Observacion);
  }

  /** Admin: historial completo de turnos. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles("admin")
  @Get()
  listAll(@Query("status") status?: string, @Query("serviceId") serviceId?: string) {
    return this.turns.listAll(status, serviceId);
  }
}
