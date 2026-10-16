import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import type { UserRole } from "@turnero/shared";

export class CreateUserDto {
  /** Cedula / nombre de usuario con el que inicia sesion. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  displayName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  password!: string;

  @IsIn(["admin", "cashier"])
  role!: UserRole;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;
}
