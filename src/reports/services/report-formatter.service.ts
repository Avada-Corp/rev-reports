import { Injectable } from "@nestjs/common";
import { RefReceive, ReportsApi, ResultText, WalletReport } from "../interfaces/index";
import { REPORTS_CONSTANTS } from "../reports.constants";
import { EncryptionService } from "./encryption.service";
import { getSlicedString, toUsdt } from "src/shared/helpers";

@Injectable()
export class ReportFormatterService {
  constructor(private readonly encryptionService: EncryptionService) {}

  /**
   * Formats API data into a readable text format
   */
  private formatApisText(apis: Pick<ReportsApi, "resultForPeriod" | "commission" | "refPaid" | "apiName">[]): string {
    return apis
      .map(
        (api) => `
<b>${api.apiName}</b>: ${toUsdt(api.resultForPeriod)}
Комиссия   ${toUsdt(api.commission)}`
      )
      .join("\n");
  }

  /**
   * Generates the formatted result text for a report
   */
  private formatResultText({
    startDate,
    endDate,
    usernameValidName,
    totalProfit,
    apisText,
    refProfit,
    totalCommission,
    reportUrl
  }: ResultText): string {
    const usernameSection = usernameValidName ? `Пользователь: ${usernameValidName}` : "";
    const refProfitSection = refProfit !== null ? `Партнерка: ${toUsdt(refProfit)}` : "";

    const reportContent = `<pre>
      Результат за период: ${new Date(startDate).toLocaleDateString("ru-RU")} - ${new Date(endDate).toLocaleDateString(
      "ru-RU"
    )}
      ${usernameSection}
      PnL:${toUsdt(totalProfit)}
      ${apisText}
      ${refProfitSection}
      Комиссия: ${toUsdt(totalCommission - (refProfit || 0))} USDT
      </pre>`;
    const reportUrlText = `\nПосмотреть полный отчет: ${reportUrl}`;
    console.log("reportUrlText: ", reportUrlText);
    return `${reportContent}`;
  }

  /**
   * Generates a wallet report in the new format
   */
  async getWalletReportTextNewFormat(report: WalletReport, refReceive: RefReceive | null): Promise<string> {
    const { apis, endDate, startDate, totalCommission, username, email } = report;

    const usernameValidName = this.getValidUsername(username, email);
    const totalProfit = this.calculateTotalProfit(apis);
    const refProfit = refReceive?.totalAmount || null;
    const reportUrl = this.encryptionService.getReportUrl(email, startDate, endDate);
    const apisText = this.formatApisText(apis);

    return this.formatResultText({
      startDate,
      endDate,
      usernameValidName,
      totalProfit,
      apisText,
      refProfit,
      totalCommission,
      reportUrl
    });
  }

  /**
   * Formats referral results into readable text
   */
  getRefResult(refReceive: RefReceive | null): string {
    if (!refReceive || !(refReceive.sources || []).some((s) => s.amount > 0)) {
      return "";
    }

    const refLines = refReceive.sources
      .filter((source) => source.amount > 0)
      .map((source) => `${getSlicedString(source.username)} - ${toUsdt(source.amount)}$ `);

    return `Результаты по реферальным платежам для юзера ${refReceive.username}: 
<pre>
${refLines.join("\n")}
</pre>`;
  }

  /**
   * Returns a valid username for display
   */
  private getValidUsername(username: string | null, email: string): string {
    return username && username !== "" && username !== REPORTS_CONSTANTS.NO_USERNAME ? username : email;
  }

  /**
   * Calculates the total profit from all APIs
   */
  private calculateTotalProfit(
    apis: Pick<ReportsApi, "resultForPeriod" | "commission" | "refPaid" | "apiName">[]
  ): number {
    return apis.reduce((acc, api) => acc + api.resultForPeriod, 0);
  }
}
