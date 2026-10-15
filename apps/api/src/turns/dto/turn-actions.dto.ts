import { Type } from "class-transformer";
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

export class FinishTurnDto {
  @IsOptional()
  @IsString()
  CedulaCliente?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  IdEncuesta?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  IdPersona?: number;
}

export class TransferTurnDto {
  @Type(() => Number)
  @IsInt()
  IdTemporal!: number;

  @Type(() => Number)
  @IsInt()
  IdAuditoria!: number;

  @Type(() => Number)
  @IsInt()
  ServicioAtransferir!: number;

  @IsString()
  Turno!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  IdPersona?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  IdEncuesta?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  idusuarioTransferencia?: number;

  @IsOptional()
  @IsString()
  CedulaCliente?: string;

  @IsOptional()
  @IsString()
  NombreCliente?: string;
}

export class NoteDto {
  @IsString()
  @MinLength(1)
  Observacion!: string;
}

export class CallSpecificDto {
  @IsString()
  Turno!: string;

  @IsString()
  Modulo!: string;
}

export class CallServiceDto {
  @Type(() => Number)
  @IsNumber()
  ServiceId!: number;
}

export class UserStateDto {
  @Type(() => Number)
  @IsInt()
  IdUsuario!: number;

  @IsString()
  Estado!: string;
}
