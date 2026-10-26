import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ReportsService } from "./reports.service";
import { ExportQueryDto, ReportQueryDto } from "./dto/report-query.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin")
@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("summary")
  summary(@Query() query: ReportQueryDto) {
    return this.reports.summary(query);
  }

  @Get("turns")
  turns(@Query() query: ReportQueryDto) {
    return this.reports.turns(query);
  }

  @Get("times")
  times(@Query() query: ReportQueryDto) {
    return this.reports.times(query);
  }

  @Get("absenteeism")
  absenteeism(@Query() query: ReportQueryDto) {
    return this.reports.absenteeism(query);
  }

  @Get("agents")
  agents(@Query() query: ReportQueryDto) {
    return this.reports.agents(query);
  }

  @Get("calls")
  calls(@Query() query: ReportQueryDto) {
    return this.reports.calls(query);
  }

  @Get("demand")
  demand(@Query() query: ReportQueryDto) {
    return this.reports.demand(query);
  }

  @Get("ratings")
  ratings(@Query() query: ReportQueryDto) {
    return this.reports.ratings(query);
  }

  @Get("export")
  async export(@Query() query: ExportQueryDto, @Res() res: Response) {
    const file = await this.reports.exportCsv(query);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
    res.send(file.content);
  }
}
