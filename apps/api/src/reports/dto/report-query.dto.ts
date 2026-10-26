import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";
import type { ReportExportType, ReportTurnStatus } from "@turnero/shared";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const TURN_STATUS: ReportTurnStatus[] = [
  "all",
  "finished",
  "absent",
  "transferred",
  "waiting",
  "cancelled",
];

const EXPORT_TYPES: ReportExportType[] = [
  "summary",
  "turns",
  "times",
  "absenteeism",
  "agents",
  "calls",
  "demand",
  "ratings",
];

export class ReportQueryDto {
  @IsOptional()
  @Matches(DATE, { message: "from debe tener formato YYYY-MM-DD" })
  from?: string;

  @IsOptional()
  @Matches(DATE, { message: "to debe tener formato YYYY-MM-DD" })
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  serviceId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  userId?: number;

  @IsOptional()
  @IsIn(TURN_STATUS)
  status?: ReportTurnStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number;
}

export class ExportQueryDto extends ReportQueryDto {
  @IsString()
  @IsIn(EXPORT_TYPES)
  report!: ReportExportType;
}
