import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  /** Caja/modulo elegido por el asesor al ingresar (se anuncia en pantalla). */
  @IsOptional()
  @IsString()
  caja?: string;
}
