import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { UserRole } from "@turnero/shared";

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  displayName?: string;

  /** Si se envia vacio o no se envia, se conserva la contrasena actual. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  password?: string;

  @IsOptional()
  @IsIn(["admin", "cashier"])
  role?: UserRole;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;
}
