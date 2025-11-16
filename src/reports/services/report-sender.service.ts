import { Injectable } from "@nestjs/common";
import { ApiService } from "src/markets/api.service";
import { sendImportantMessageAsync, timeout } from "src/markets/helpers";
import { toLocale } from "src/shared/helpers";
import { RefPaid, RefReceive, SendProductionReports, WalletReport } from "../interfaces/index";
import { ReportsConfig } from "../reports.config";
import { ReportFormatterService } from "./report-formatter.service";

@Injectable()
export class ReportSenderService {
  constructor(
    private readonly api: ApiService,
    private readonly reportsConfig: ReportsConfig,
    private readonly reportFormatterService: ReportFormatterService
  ) {}

  /**
   * Sends important message to notification channel
   */
  async sendMessage(...text: string[]): Promise<void> {
    await sendImportantMessageAsync(...text);
  }

  /**
   * Sends production reports and processes commissions
   */
  async sendTransactionOnlyProduction({
    walletReport,
    userStartDate,
    to,
    start
  }: SendProductionReports): Promise<void> {
    if (!this.reportsConfig.isProduction) {
      return;
    }

    const walletReportString = this.serializeWalletReport(walletReport);
    const startDateText = userStartDate !== start ? "(Измененный период)" : "";
    const periodText = `Комиссия за период ${toLocale(userStartDate)} - ${toLocale(to)}`;

    for (const api of walletReport.apis) {
      const explanation = `${periodText} ${startDateText}: ${walletReportString}`;

      const transaction = {
        email: walletReport.email,
        amount: api.commission,
        tgUserName: walletReport.username || "",
        explanation,
        refPaid: api.refPaid,
        start: userStartDate, // Используем индивидуальное время начала отчета
        to,
        explanationData: {
          startBalance: api.startBalance,
          endBalance: api.endBalance,
          startPnl: api.startPnl,
          endPnl: api.endPnl,
          realizedPnl: api.realizedPnl,
          startPeriod: walletReport.startPeriod,
          endPeriod: walletReport.endPeriod,
          apiName: api.apiName
        }
      };

      await this.saveTransaction(transaction);
    }
  }

  /**
   * Sends reports to users with referral information
   */
  async sendReportsWithDatesOnlyProduction(
    walletReports: WalletReport[],
    usernameMap: Map<string, string>
  ): Promise<void> {
    if (!this.reportsConfig.isProduction) {
      return;
    }

    const referralReceivers = this.collectReferralPayments(walletReports, usernameMap);
    await this.sendReportsToUsers(walletReports, referralReceivers);
  }

  /**
   * Serializes wallet report to string with error handling
   */
  private serializeWalletReport(walletReport: WalletReport): string {
    try {
      return JSON.stringify(walletReport);
    } catch (error) {
      return "Ошибка при конвертации в строку";
    }
  }

  /**
   * Saves transaction to API and logs errors
   */
  private async saveTransaction(transaction: any): Promise<void> {
    const sendResult = await this.api.sendCommission(transaction);
    if (!sendResult.status) {
      console.error("Not saved transaction: ", transaction);
    }
  }

  /**
   * Collects and processes referral payments from wallet reports
   */
  private collectReferralPayments(walletReports: WalletReport[], usernameMap: Map<string, string>): RefReceive[] {
    const referralReceivers: RefReceive[] = [];

    walletReports.forEach((report) => {
      report.apis.forEach((api) => {
        const refPayments = api.refPaid.filter((payment) => payment !== null) as RefPaid[];

        refPayments.forEach((payment) => {
          const username = usernameMap.get(report.email) || report.email;
          const usernameReceiver = usernameMap.get(payment.email) || payment.email;

          const source = {
            fromEmail: report.email,
            username,
            amount: payment.amount,
            explanation: payment.explanation
          };

          this.updateOrCreateReferralReceiver(referralReceivers, payment, source, usernameReceiver);
        });
      });
    });

    return referralReceivers;
  }

  /**
   * Updates existing receiver or creates a new one
   */
  private updateOrCreateReferralReceiver(
    referralReceivers: RefReceive[],
    payment: RefPaid,
    source: any,
    usernameReceiver: string
  ): void {
    const existingReceiver = referralReceivers.find((receiver) => receiver.email === payment.email);

    if (existingReceiver) {
      existingReceiver.totalAmount += payment.amount;
      existingReceiver.sources.push(source);
    } else {
      referralReceivers.push({
        email: payment.email,
        totalAmount: payment.amount,
        sources: [source],
        username: usernameReceiver
      });
    }
  }

  private async sendPdfReportFileToUser(walletReport: WalletReport): Promise<void> {
    try {
      await this.api.sendWalletReport(walletReport);
    } catch (error) {
      console.error("Error sending wallet report:", error);
    }
  }

  /**
   * Sends formatted reports to each user
   */
  private async sendReportsToUsers(walletReports: WalletReport[], referralReceivers: RefReceive[]): Promise<void> {
    for (const walletReport of walletReports) {
      const refReceive = referralReceivers.find((r) => r.email === walletReport.email) || null;

      await sendImportantMessageAsync(
        await this.reportFormatterService.getWalletReportTextNewFormat(walletReport, refReceive)
      );
      await this.sendPdfReportFileToUser(walletReport);

      await timeout(1000);

      const refResult = this.reportFormatterService.getRefResult(refReceive);
      if (refResult !== "") {
        console.log("refResult: ", refResult);
        await sendImportantMessageAsync(refResult);
      }
    }
  }
}
