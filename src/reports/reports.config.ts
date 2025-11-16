import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { envToBoolean } from "../markets/helpers";
@Injectable()
export class ReportsConfig {
  constructor(private readonly configService: ConfigService) {}

  get isProduction(): boolean {
    return envToBoolean(this.configService.get<string>("IS_PRODUCTION", "false"));
  }

  get isWeeklyReportsByDefault(): boolean {
    return envToBoolean(this.configService.get<string>("IS_WEEKLY_REPORTS_BY_DEFAULT", "false"));
  }

  get reportSecretKey(): string {
    return this.configService.get<string>("REPORT_SECRET_KEY", "");
  }
}
