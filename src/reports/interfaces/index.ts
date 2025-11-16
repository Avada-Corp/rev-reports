import { CommissionApi, PrivateCommission } from "src/markets/reports/interfaces";

export interface PeriodReport {
  email: string;
  username: string;
  apiName: string;
  start: number;
  to: number;
  pnl: number | null;
  pnlDaily: number | null;
  keyId: string;
  totalBalance: number | null;
}

export interface ReportForPeriod {
  email: string;
  username: string;
  apiName: string;
  start: number;
  to: number;
  totalProfit: number;
  tgAccount: string;
  keyId: string;
  startBalance: number;
  endBalance: number;
  startPnl: number;
  endPnl: number;
  realizedPnl: number;
}

export interface ReportResult {
  report: ReportForPeriod;
  allReferrers: any[];
  usernameMap: Map<string, string>;
  userCommissionValues: CommissionValues;
  apiCommissions: CommissionApi[];
}

export interface SendProductionReports {
  walletReport: WalletReport;
  userStartDate: number;
  to: number;
  start: number;
}

export interface WalletReport {
  startDate: number;
  endDate: number;
  email: string;
  username: string | null;
  apis: ApisReportWithTotalBalanceStart[];
  totalCommission: number;
  startBalance: number;
  endBalance: number;
  startPnl: number;
  endPnl: number;
  realizedPnl: number;
  startPeriod?: string;
  endPeriod?: string;
}

export interface ResultText {
  startDate: number | string;
  endDate: number | string;
  usernameValidName: string | null;
  totalProfit: number;
  apisText: string;
  refProfit: number | null;
  totalCommission: number;
  reportUrl: string;
}

export interface CommissionValues {
  privateCommission: PrivateCommission;
  userBalance: number;
  countedCommissionPercent: number;
}

export interface GetWalletReport {
  fullReportsForPeriod: ReportForPeriod[];
  commissionValues: CommissionValues;
  username: string | null;
  userBalance?: number;
  allReferrers: any[];
  usernameMap: Map<string, string>;
  privateCommission: {
    percent: number | null;
    absolute: number | null;
  };
  apiCommissions: CommissionApi[];
}

export interface ReferrerData {
  userEmail: string;
  refId: Record<
    string,
    {
      email: string;
      levelName: "firstLevel" | "secondLevel" | "thirdLevel";
    }
  >;
}

export interface RefPaid {
  username: string;
  email: string;
  amount: number;
  explanation: string;
}

export interface RefReceive {
  email: string;
  username: string;
  totalAmount: number;
  sources: {
    fromEmail: string;
    username: string;
    amount: number;
    explanation: string;
  }[];
}

export interface ReportsApi {
  apiName: string;
  resultForPeriod: number;
  resultForPeriodWithDelta?: number;
  commission: number;
  refPaid: (RefPaid | null)[];
  reportDelta?: number;
}

export interface ApisReport extends ReportsApi {
  reportDelta: number;
}

export type ApisReportWithTotalBalanceStart = {
  startBalance: number;
  endBalance: number;
  startPnl: number;
  endPnl: number;
  realizedPnl: number;
  apiName: string;
  apiId: string;
  resultForPeriod: number;
  resultForPeriodWithDelta?: number;
  commission: number;
  refPaid: (RefPaid | null)[];
};

export interface CommissionCalculationRequest {
  email: string;
  totalCommissions: number;
  totalBalances: number;
  from: number;
  to: number;
}
