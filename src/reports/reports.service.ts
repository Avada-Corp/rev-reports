import { Injectable } from "@nestjs/common";
import { DbService } from "src/db/db.service";
import { getSumOfArray } from "../markets/helpers";
import { ApiService } from "../markets/api.service";
import { ReportsConfig } from "./reports.config";
import { ReportSenderService } from "./services/report-sender.service";
import { ReportGeneratorService } from "./services/report-generator.service";
import { WalletReport } from "./interfaces/index";

@Injectable()
export class ReportsService {
  constructor(
    private readonly db: DbService,
    private readonly api: ApiService,
    private readonly reportsConfig: ReportsConfig,
    private readonly reportSenderService: ReportSenderService,
    private readonly reportGeneratorService: ReportGeneratorService
  ) {}

  async compareBalances(): Promise<void> {
    const apis = await this.api.getApi();
    const usernames = (await this.db.getUsernames())?.data || [];

    for (const api of apis) {
      const reports = await this.db.getLast2Reports(api.id);
      if (!reports.lastReport || !reports.prevReport) {
        continue;
      }

      const curBalance = reports.lastReport.totalBalance;
      const prevBalance = reports.prevReport.totalBalance;
      const balanceDelta = curBalance - prevBalance;

      const sumOfTransfers = this.calculateTransferSum(reports.lastReport.transfers);
      const clearDelta = balanceDelta - sumOfTransfers;
      const clearDeltaPercent = (100 * clearDelta) / curBalance;

      if (this.shouldSendAlert(clearDelta, clearDeltaPercent)) {
        const username = this.getUsernameByEmail(usernames, api.email);
        await this.sendBalanceAlert(
          username,
          api.name,
          curBalance,
          prevBalance,
          sumOfTransfers,
          balanceDelta,
          clearDeltaPercent
        );
      }
    }
  }

  private calculateTransferSum(transfers: { deposits?: number[]; withdrawals?: number[] }): number {
    return getSumOfArray(transfers?.deposits || []) - getSumOfArray(transfers?.withdrawals || []);
  }

  private shouldSendAlert(clearDelta: number, clearDeltaPercent: number): boolean {
    return clearDelta > 50 && clearDeltaPercent > 1 && this.reportsConfig.isProduction;
  }

  private getUsernameByEmail(usernames: Array<{ email: string; username: string }>, email: string): string {
    return usernames.find((u) => u.email === email)?.username || email;
  }

  private async sendBalanceAlert(
    username: string,
    apiName: string,
    currentBalance: number,
    previousBalance: number,
    transferSum: number,
    balanceDelta: number,
    clearDeltaPercent: number
  ): Promise<void> {
    await this.reportSenderService.sendMessage(
      `Username: ${username}`,
      `Api: ${apiName}`,
      `Баланс: ${currentBalance}`,
      `Вчерашний баланс: ${previousBalance}`,
      `Сумма трансферов: ${transferSum}`,
      `Разница: ${balanceDelta.toFixed(0)} USDT, ${clearDeltaPercent.toFixed(2)} %`
    );
  }

  async makeReport(start: number, to: number, reportType: "weekly" | "monthly"): Promise<WalletReport[]> {
    return await this.reportGeneratorService.makeReport(start, to, reportType);
  }

  async makeReportDryRun(start: number, to: number, reportType: "weekly" | "monthly"): Promise<WalletReport[]> {
    return await this.reportGeneratorService.makeReportDryRun(start, to, reportType);
  }

  async makeUserReport(start: number, to: number, email: string, isStartModify: boolean): Promise<WalletReport | null> {
    return await this.reportGeneratorService.makeUserReport(start, to, email, isStartModify);
  }

  async updateOldReports() {
    const histories = await this.db.getAllApiReports(1743109200000, 1746127966000);
    let updatedCount = 0;

    for (const report of histories.filter((h) => h.totalBalance != null)) {
      if (!report.totalBalance) continue;

      try {
        // Update the PNL report with totalBalance value from history report
        const updated = await this.reportGeneratorService.updatePnlReportBalance(
          report.start,
          report.to,
          report.keyId,
          report.totalBalance
        );

        if (updated) updatedCount++;
        if (updatedCount % 100 === 0) {
          console.log(`Successfully updated ${updatedCount} PNL reports with totalBalance values`);
        }
      } catch (error) {
        console.error(`Failed to update report for keyId: ${report.keyId}`, error);
      }
    }

    console.log(`Successfully updated ${updatedCount} PNL reports with totalBalance values`);
  }
}
