import { IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

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
}
