import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  prefix?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @IsOptional()
  @IsInt()
  order?: number;
}
