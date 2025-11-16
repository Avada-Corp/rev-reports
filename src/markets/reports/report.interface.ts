import { ReferrerData, PrivateCommission, ReportsApi, ApisReportWithTotalBalanceStart } from "./interfaces";

export interface ResultText {
  startDate: number | string;
  endDate: number | string;
  usernameValidName: string;
  totalProfit: number;
  apisText: string;
  refProfit: number | null;
  totalCommission: number;
  reportUrl: string;
}

export interface SendProductionReports {
  walletReport: WalletReport;
  userStartDate: number;
  to: number;
  start: number;
}

export interface ReportResult {
  report: ReportForPeriod;
  allReferrers: ReferrerData[];
  usernameMap: Map<string, string>;
  commissionPercent: number | null;
}

export interface GetWalletReport {
  fullReportsForPeriod: ReportForPeriod[];
  commissionPercent: number | null;
  username: string;
  userBalance: number;
  allReferrers: ReferrerData[];
  usernameMap: Map<string, string>;
  privateCommission: PrivateCommission;
}
export interface PeriodReport {
  email: string;
  keyId: string;
  username: string;
  apiName: string;
  start: number;
  to: number;
  pnl: number;
  pnlDaily: number;
}

export interface ReportForPeriod {
  email: string;
  username: string;
  apiName: string;
  start: number;
  to: number;
  totalProfit: number;
  keyId: string;
  tgAccount: string;
}

export interface WalletReport {
  startDate: number;
  endDate: number;
  email: string;
  username: string | null;
  apis: ApisReportWithTotalBalanceStart[];
  totalCommission: number;
}
