import { Injectable } from "@nestjs/common";
import { DbService } from "src/db/db.service";
import { ApiService } from "src/markets/api.service";
import { ReportsConfig } from "../reports.config";
import { ReportSenderService } from "./report-sender.service";
import { EncryptionService } from "./encryption.service";
import {
  GetWalletReport,
  PeriodReport,
  ReferrerData,
  RefPaid,
  ReportForPeriod,
  ReportResult,
  WalletReport,
  ApisReportWithTotalBalanceStart
} from "../interfaces/index";
import { ApiByApi } from "src/markets/interfaces/index";
import { AccountPnlDocument } from "src/db/models/account-pnl.schema";
import { REPORTS_CONSTANTS } from "../reports.constants";
import { ApisReport, CommissionApi } from "src/markets/reports/interfaces";
import { UserResults } from "src/db/models/user-results.schema";

@Injectable()
export class ReportGeneratorService {
  constructor(
    private readonly db: DbService,
    private readonly api: ApiService,
    private readonly reportsConfig: ReportsConfig,
    private readonly encryptionService: EncryptionService,
    private readonly reportSenderService: ReportSenderService
  ) {}

  /**
   * Gets user reports calendar with dates map and oldest date
   */
  async getUserReportsCalendar(
    apiArray: Pick<ApiByApi, "email">[]
  ): Promise<{ usersDatesMap: Map<string, number>; oldestDate: number }> {
    const usersDatesMap: Map<string, number> = new Map();
    let oldestDate = new Date().getTime();
    const usersInfo = await this.db.getAllLastCommission();

    for (const api of apiArray) {
      const userInfo = usersInfo.find((u) => u.email === api.email);
      if (userInfo == null) {
        continue;
      }
      usersDatesMap.set(api.email, userInfo.to);
      if (userInfo.to < oldestDate) {
        oldestDate = userInfo.to;
      }
    }

    return { usersDatesMap, oldestDate };
  }

  /**
   * Checks if report is within date range for user
   */
  isReportByDate(report: AccountPnlDocument, usersDatesMap: Map<string, number>, from: number): boolean {
    const userStartDate = usersDatesMap.get(report.email) || from;
    return report.to >= userStartDate;
  }

  /**
   * Gets all reports filtered by dates
   */
  async getAllReportsByDates(
    from: number,
    to: number,
    oldestDate: number,
    usersDatesMap: Map<string, number>
  ): Promise<PeriodReport[]> {
    const allApiPnlReports = await this.db.getAllApiPnlReports(oldestDate, Number(to));
    const filteredByDateReports = allApiPnlReports.filter((rep) => this.isReportByDate(rep, usersDatesMap, from));

    return filteredByDateReports.map((report) => ({
      email: report.email,
      username: report.username,
      apiName: report.keyName,
      start: report.start,
      to: report.to,
      pnl: report.pnl,
      pnlDaily: report.pnlDaily,
      keyId: report.keyId,
      totalBalance: report.totalBalance
    }));
  }

  async getAllReportsByDatesByEmail(start: number, to: number, email: string): Promise<PeriodReport[]> {
    const allApiPnlReports = await this.db.getAllApiPnlReportsByEmail(Number(start), Number(to), email);

    return allApiPnlReports.map((report) => ({
      email: report.email,
      username: report.username,
      apiName: report.keyName,
      start: report.start,
      to: report.to,
      pnl: report.pnl,
      pnlDaily: report.pnlDaily,
      keyId: report.keyId,
      totalBalance: report.totalBalance
    }));
  }

  /**
   * Filters reports by report type (weekly or monthly)
   */
  filterByReportTypeReports(
    reports: PeriodReport[],
    reportType: "weekly" | "monthly",
    apiArray: ApiByApi[]
  ): PeriodReport[] {
    const reportDefaultType = this.reportsConfig.isWeeklyReportsByDefault ? "weekly" : "monthly";

    return reports.filter((report) => {
      const userEmail = report.email;
      const userApi = apiArray.find((api) => api.email === userEmail);

      if (userApi == null) {
        return reportType === reportDefaultType;
      }

      return userApi.commissionType != null ? userApi.commissionType === reportType : reportType === reportDefaultType;
    });
  }

  /**
   * Groups reports by email and API name
   */
  getCollapsedReports(reports: PeriodReport[]): Record<string, Record<string, Array<PeriodReport>>> {
    const result: Record<string, Record<string, Array<PeriodReport>>> = {};

    reports.forEach((report) => {
      const { username, apiName, start, to, pnl, pnlDaily, email, keyId } = report;
      const uniqueApiName = `${apiName}${REPORTS_CONSTANTS.COLLAPSED_SPLIT_SYMBOL}${keyId}`;

      if (result[email] == null) {
        result[email] = {};
      }

      if (result[email][uniqueApiName] == null) {
        result[email][uniqueApiName] = [];
      }

      result[email][uniqueApiName].push({
        email,
        username,
        apiName,
        start,
        to,
        pnl,
        pnlDaily,
        keyId,
        totalBalance: report.totalBalance
      });
    });

    return result;
  }

  /**
   * Prepares reports by calculating totals and organizing data
   */
  private prepareReports(
    allReports: PeriodReport[],
    usersDatesMap: Map<string, number>,
    from: number
  ): ReportForPeriod[] {
    const collapsedReports = this.getCollapsedReports(allReports);
    const fullReports: ReportForPeriod[] = [];

    for (const email of Object.keys(collapsedReports)) {
      for (const apiName of Object.keys(collapsedReports[email])) {
        const userStartDate = usersDatesMap.get(email) || from;
        const reports = collapsedReports[email][apiName].sort((a, b) => a.start - b.start);

        const lastReport = reports[reports.length - 1];
        const firstReport = reports[0];
        const { keyId, start, to: toFirst } = firstReport;
        const { to } = lastReport;
        const pnlStart = firstReport.pnl;
        const pnlEnd = lastReport.pnl;

        const pnlSumForPeriod = reports
          .filter((r) => r.start >= userStartDate)
          .reduce<number>((acc, val) => acc + (val.pnlDaily || 0), 0);

        const pnlDelta = (pnlEnd || 0) - (pnlStart || 0);
        const totalProfit = pnlSumForPeriod + pnlDelta;

        fullReports.push({
          email,
          start: toFirst,
          to,
          username: reports[0].username,
          apiName: apiName.split(REPORTS_CONSTANTS.COLLAPSED_SPLIT_SYMBOL)[0],
          totalProfit,
          tgAccount: "NEED TO FIND",
          keyId,
          startBalance: firstReport.totalBalance || 0,
          endBalance: lastReport.totalBalance || 0,
          startPnl: pnlStart || 0,
          endPnl: pnlEnd || 0,
          realizedPnl: pnlSumForPeriod || 0
        });
      }
    }

    return fullReports;
  }

  /**
   * Groups reports by user email
   */
  collapseByUser(reports: ReportForPeriod[]): Record<string, ReportForPeriod[]> {
    const result: Record<string, ReportForPeriod[]> = {};

    reports.forEach((report) => {
      if (result[report.email] == null) {
        result[report.email] = [];
      }
      result[report.email].push(report);
    });

    return result;
  }

  /**
   * Calculates wallet result for a single report
   */
  async getWalletResult({
    report,
    allReferrers,
    usernameMap,
    userCommissionValues,
    apiCommissions
  }: ReportResult): Promise<ApisReportWithTotalBalanceStart> {
    const { apiName, totalProfit, email } = report;
    const apiReferrers: ReferrerData | null = allReferrers.find((a) => a.userEmail === email) || null;
    const lastApiDelta = await this.db.getLastApiDelta(email, apiName);
    const totalProfitWithDelta = totalProfit + lastApiDelta;

    // Получаем apiId (rev_id) из базы данных по email и apiName
    const apiInfo = await this.db.getApiByEmailAndName(email, apiName);
    const apiId = apiInfo?.rev_id || "";

    let apiCommission = 0;

    const curApiPrivateCommission = apiCommissions.find((a) => a.apiName === apiName)?.privateCommission || {
      percent: null,
      absolute: null
    };
    const curUserPrivateCommission = userCommissionValues.privateCommission;
    const percentCoefficient = totalProfitWithDelta / 100;
    if (curApiPrivateCommission.percent != null) {
      apiCommission = percentCoefficient * curApiPrivateCommission.percent;
    } else if (curApiPrivateCommission.absolute != null) {
      apiCommission = curApiPrivateCommission.absolute;
    } else if (curUserPrivateCommission.percent != null) {
      apiCommission = percentCoefficient * curUserPrivateCommission.percent;
    } else if (curUserPrivateCommission.absolute != null) {
      apiCommission = 0;
    } else if (userCommissionValues.countedCommissionPercent != null) {
      apiCommission = percentCoefficient * userCommissionValues.countedCommissionPercent;
    }

    const refPaid: (RefPaid | null)[] = Object.values(apiReferrers?.refId || {})
      .filter((ref) => ref != null)
      .map((ref) => ({
        username: usernameMap.get(ref.email) || REPORTS_CONSTANTS.NO_USERNAME,
        email: ref.email,
        amount: ((apiCommission || 0) * REPORTS_CONSTANTS.COMMISSION_MAP[ref.levelName]) / 100,
        explanation: `Комиссия за ${ref.levelName} уровня, от пользователя ${email}`
      }));

    return {
      apiName,
      apiId,
      resultForPeriod: totalProfit,
      resultForPeriodWithDelta: totalProfitWithDelta,
      commission: apiCommission,
      refPaid,
      startBalance: report.startBalance,
      endBalance: report.endBalance,
      startPnl: report.startPnl,
      endPnl: report.endPnl,
      realizedPnl: report.realizedPnl
    };
  }

  /**
   * Generates complete wallet report for a user
   */
  async getWalletReport({
    fullReportsForPeriod,
    commissionValues,
    username,
    allReferrers,
    usernameMap,
    privateCommission,
    apiCommissions
  }: GetWalletReport): Promise<WalletReport> {
    const apis: ApisReportWithTotalBalanceStart[] = [];

    for (const report of fullReportsForPeriod) {
      const api = await this.getWalletResult({
        report,
        allReferrers,
        usernameMap,
        userCommissionValues: commissionValues,
        apiCommissions
      });
      apis.push(api);
    }

    const report = fullReportsForPeriod[0];
    const { percent, absolute } = privateCommission;

    const startBalance = fullReportsForPeriod.reduce((acc, val) => acc + val.startBalance, 0);
    const endBalance = fullReportsForPeriod.reduce((acc, val) => acc + val.endBalance, 0);
    const startPnl = fullReportsForPeriod.reduce((acc, val) => acc + val.startPnl, 0);
    const endPnl = fullReportsForPeriod.reduce((acc, val) => acc + val.endPnl, 0);
    const realizedPnl = fullReportsForPeriod.reduce((acc, val) => acc + val.realizedPnl, 0);

    const totalCommission: number =
      percent == null && absolute != null
        ? absolute
        : apis.reduce((acc, val) => {
            let curCommission = val.commission;
            if (curCommission == null || curCommission < 0) {
              curCommission = 0;
            }
            return acc + curCommission;
          }, 0);

    return {
      startDate: report.start,
      endDate: report.to,
      email: report.email,
      username,
      apis,
      totalCommission,
      startBalance,
      endBalance,
      startPnl,
      endPnl,
      realizedPnl,
      startPeriod: new Date(report.start).toLocaleDateString(),
      endPeriod: new Date(report.to).toLocaleDateString()
    };
  }

  /**
   * Main method to generate reports for a period
   */
  async makeReport(start: number, to: number, reportType: "weekly" | "monthly"): Promise<WalletReport[]> {
    // Get API array and user dates
    const apiArray = await this.api.getApi();
    const { usersDatesMap, oldestDate } = await this.getUserReportsCalendar(apiArray);

    // Get and process reports
    const allReports = await this.getAllReportsByDates(start, to, oldestDate, usersDatesMap);
    const periodReports = this.filterByReportTypeReports(allReports, reportType, apiArray);
    const preparedReports = this.prepareReports(periodReports, usersDatesMap, start);
    const collapsedUsersReports = this.collapseByUser(preparedReports);

    // Get additional data
    const walletReports: WalletReport[] = [];
    const usernameMap = await this.db.getUserNameMap();
    const allReferrers = await this.db.getAllReferrers();
    const userCommissions = await this.api.getUsersCommissions(to);

    const apisCommissions: CommissionApi[] = await this.api.getApiCommissions(to);

    // Process each user's reports
    for (const userEmail of Object.keys(collapsedUsersReports)) {
      console.log(
        `Processing report ${Object.keys(collapsedUsersReports).indexOf(userEmail) + 1} of ${
          Object.keys(collapsedUsersReports).length
        } for user: ${userEmail}`
      );
      if (userEmail === "undefined") {
        continue;
      }

      const userCommission = userCommissions.find((u) => u.email === userEmail);
      console.log("userCommission: ", userCommission);
      const apiCommissions = apisCommissions.filter((u) => u.email === userEmail);
      console.log("apiCommissions: ", apiCommissions);
      if (userCommission == null) {
        continue;
      }

      const username = usernameMap.get(userEmail) || REPORTS_CONSTANTS.NO_USERNAME;
      // const { percent, absolute } = userCommission.privateCommission;
      // const commissionPercent = percent != null ? percent : absolute != null ? null : userCommission.countedCommission;

      const userCommissionValues = {
        privateCommission: userCommission.privateCommission,
        userBalance: userCommission.balanceForCommissions,
        countedCommissionPercent: userCommission.countedCommission
      };
      console.log("userCommissionValues: ", userCommissionValues);

      // Generate wallet report
      const walletReport = await this.getWalletReport({
        fullReportsForPeriod: collapsedUsersReports[userEmail],
        commissionValues: userCommissionValues,
        privateCommission: userCommission.privateCommission,
        username,
        userBalance: userCommission?.userBalance || 0,
        allReferrers,
        usernameMap,
        apiCommissions
      });
      if (
        userCommission.privateCommission.percent == null &&
        apiCommissions.every((api) => api.privateCommission == null) &&
        userCommission.privateCommission.absolute != null
      ) {
        walletReport.totalCommission = userCommission.privateCommission.absolute;
      }
      walletReports.push(walletReport);

      await this.saveProductionResultsOnlyProduction(walletReport, userEmail, reportType);

      // Send production reports
      await this.reportSenderService.sendTransactionOnlyProduction({
        walletReport,
        userStartDate: usersDatesMap.get(userEmail) || start,
        to,
        start
      });
    }

    // Send reports with dates
    await this.reportSenderService.sendReportsWithDatesOnlyProduction(walletReports, usernameMap);

    if (this.reportsConfig.isProduction) {
      await this.api.sendNegativeBalancesDataToUser(reportType);
    }
    return walletReports;
  }

  /**
   * Main method to generate reports for a period (dry run - no database saves or notifications)
   */
  async makeReportDryRun(start: number, to: number, reportType: "weekly" | "monthly"): Promise<WalletReport[]> {
    // Get API array and user dates
    const apiArray = await this.api.getApi();
    // Get and process reports
    const allReports = await this.getAllReportsByDates(start, to, start, new Map());
    const periodReports = this.filterByReportTypeReports(allReports, reportType, apiArray);
    const preparedReports = this.prepareReports(periodReports, new Map(), start);
    const collapsedUsersReports = this.collapseByUser(preparedReports);
    // Get additional data
    const walletReports: WalletReport[] = [];
    const usernameMap = await this.db.getUserNameMap();
    const allReferrers = await this.db.getAllReferrers();
    const userCommissions = await this.api.getUsersCommissions(to);

    const apisCommissions: CommissionApi[] = await this.api.getApiCommissions(to);

    // Process each user's reports
    for (const userEmail of Object.keys(collapsedUsersReports)) {
      console.log(
        `Processing report ${Object.keys(collapsedUsersReports).indexOf(userEmail) + 1} of ${
          Object.keys(collapsedUsersReports).length
        } for user: ${userEmail}`
      );
      if (userEmail === "undefined") {
        continue;
      }

      const userCommission = userCommissions.find((u) => u.email === userEmail);
      const apiCommissions = apisCommissions.filter((u) => u.email === userEmail);
      if (userCommission == null) {
        continue;
      }

      const username = usernameMap.get(userEmail) || REPORTS_CONSTANTS.NO_USERNAME;

      const userCommissionValues = {
        privateCommission: userCommission.privateCommission,
        userBalance: userCommission.balanceForCommissions,
        countedCommissionPercent: userCommission.countedCommission
      };

      // Generate wallet report
      const walletReport = await this.getWalletReport({
        fullReportsForPeriod: collapsedUsersReports[userEmail],
        commissionValues: userCommissionValues,
        privateCommission: userCommission.privateCommission,
        username,
        userBalance: userCommission?.userBalance || 0,
        allReferrers,
        usernameMap,
        apiCommissions
      });
      console.log("walletReport: ", walletReport);
      if (
        userCommission.privateCommission.percent == null &&
        apiCommissions.every((api) => api.privateCommission == null) &&
        userCommission.privateCommission.absolute != null
      ) {
        walletReport.totalCommission = userCommission.privateCommission.absolute;
      }
      walletReports.push(walletReport);

      // DRY RUN: Skip database saves and notifications
      // await this.saveProductionResultsOnlyProduction(walletReport, userEmail, reportType);
      // await this.reportSenderService.sendTransactionOnlyProduction({...});
    }

    // DRY RUN: Skip sending reports to users
    // await this.reportSenderService.sendReportsWithDatesOnlyProduction(walletReports, usernameMap);

    return walletReports;
  }

  /**
   * Saves production results to database
   */
  private async saveProductionResultsOnlyProduction(
    walletReport: WalletReport,
    userEmail: string,
    reportType: "weekly" | "monthly"
  ): Promise<void> {
    if (!this.reportsConfig.isProduction) {
      return;
    }

    const updatedApi: ApisReport[] = [];

    for (const api of walletReport.apis) {
      const lastApiDelta = await this.db.getLastApiDelta(userEmail, api.apiName);
      const newReportDelta = api.resultForPeriod + lastApiDelta;
      const periodDelta = newReportDelta > 0 ? 0 : newReportDelta;
      updatedApi.push({ ...api, reportDelta: periodDelta });
    }

    // Save wallet report to userResults collection
    const userResult: UserResults = {
      startDate: walletReport.startDate,
      endDate: walletReport.endDate,
      email: walletReport.email,
      username: walletReport.username,
      apis: updatedApi,
      totalCommission: walletReport.totalCommission,
      reportType
    };

    await this.db.saveUserResults(userResult);
  }

  /**
   * Updates totalBalance field in PNL report
   */
  async updatePnlReportBalance(start: number, to: number, keyId: string, totalBalance: number): Promise<boolean> {
    try {
      const pnlReports = await this.db.getApiPnlReport(start, to, keyId);
      if (!pnlReports || pnlReports.length === 0) {
        return false;
      }

      // Get the first report document and use MongoDB updateOne to set totalBalance
      const pnlReport = pnlReports[0];
      const updateResult = await this.db["accountPnlModel"].findOneAndUpdate(
        {
          start,
          to,
          keyId
        },
        {
          $set: { totalBalance }
        }
      );

      return updateResult != null;
    } catch (error) {
      console.error(`Failed to update PNL report balance for keyId: ${keyId}`, error);
      return false;
    }
  }

  async getUserStart(email: string, start: number, isStartModify: boolean): Promise<number> {
    if (isStartModify) {
      const userInfo = await this.db.getLastCommissionByEmail(email);
      const userStart = userInfo.data?.start || start;
      return userStart > start ? start : userStart;
    } else {
      return start;
    }
  }

  /**
   * Generate report for a specific user for a period
   */
  async makeUserReport(start: number, to: number, email: string, isStartModify: boolean): Promise<WalletReport | null> {
    const userStart = await this.getUserStart(email, start, isStartModify);
    // isStartModify добавлено для тг бота 08,07,2025, чтобы не сбрасывать периоды, которые уже были сгенерированы
    const allReports = await this.getAllReportsByDatesByEmail(userStart, to, email);
    console.log("allReports: ", allReports.length);
    if (allReports.length === 0) {
      return null;
    }

    const usersDatesMap: Map<string, number> = new Map();
    usersDatesMap.set(email, start);

    const preparedReports = this.prepareReports(allReports, usersDatesMap, start);
    console.log("preparedReports: ", preparedReports);

    // Get additional data
    const usernameMap = await this.db.getUserNameMap();
    const allReferrers = await this.db.getUserReferrers(email);
    const userCommissions = await this.api.getUsersCommissions(to);
    const apisCommissions: CommissionApi[] = await this.api.getApiCommissions(to);

    const userCommission = userCommissions.find((u) => u.email === email);
    const apiCommissions = apisCommissions.filter((u) => u.email === email);
    console.log("apiCommissions: ", apiCommissions);

    console.log("userCommission: ", userCommission);
    if (userCommission == null) {
      return null;
    }

    const username = usernameMap.get(email) || REPORTS_CONSTANTS.NO_USERNAME;

    const userCommissionValues = {
      privateCommission: userCommission.privateCommission,
      userBalance: userCommission.balanceForCommissions,
      countedCommissionPercent: userCommission.countedCommission
    };

    const forReportData = {
      fullReportsForPeriod: preparedReports,
      commissionValues: userCommissionValues,
      privateCommission: userCommission.privateCommission,
      username,
      userBalance: userCommission?.userBalance || 0,
      allReferrers,
      usernameMap,
      apiCommissions
    };
    // console.log("forReportData: ", forReportData);

    // Generate wallet report
    const walletReport = await this.getWalletReport(forReportData);
    console.log("walletReport: ", walletReport);

    if (
      userCommission.privateCommission.percent == null &&
      apiCommissions.every((api) => api.privateCommission == null) &&
      userCommission.privateCommission.absolute != null
    ) {
      walletReport.totalCommission = userCommission.privateCommission.absolute;
    }

    return walletReport;
  }
}
