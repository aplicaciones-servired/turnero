import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  businessName?: string;

  @IsOptional()
  @IsString()
  ticketHeader?: string;

  @IsOptional()
  @IsString()
  ticketFooter?: string;

  @IsOptional()
  @IsString()
  announcePrefix?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(1.5)
  voiceRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(1.5)
  voicePitch?: number;

  @IsOptional()
  @IsString()
  marquee?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  voiceVolume?: number;

  // ── Impresion del ticket ──
  @IsOptional()
  @IsInt()
  @Min(20)
  @Max(80)
  printWidth?: number;

  @IsOptional()
  @IsBoolean()
  printLogo?: boolean;

  @IsOptional()
  @IsString()
  printLogoFile?: string;

  @IsOptional()
  @IsBoolean()
  printShowHeader?: boolean;

  @IsOptional()
  @IsBoolean()
  printShowService?: boolean;

  @IsOptional()
  @IsBoolean()
  printShowDate?: boolean;

  @IsOptional()
  @IsBoolean()
  printShowQr?: boolean;

  @IsOptional()
  @IsString()
  printQrTemplate?: string;

  @IsOptional()
  @IsBoolean()
  printShowFooter?: boolean;

  @IsOptional()
  @IsIn(["normal", "double", "triple", "quad"])
  printTurnSize?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  printFeed?: number;

  @IsOptional()
  @IsBoolean()
  printCut?: boolean;

  @IsOptional()
  @IsBoolean()
  printOpenDrawer?: boolean;
}
