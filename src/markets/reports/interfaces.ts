import { ApiByApi } from "../interfaces/index";

export interface PrivateCommission {
  percent: number | null;
  absolute: number | null;
}

export interface ReportsApi {
  apiName: string;
  resultForPeriod: number;
  commission: number;
  startPnl: number | null;
  endPnl: number | null;
  cumulativePnl: number | null;
  totalBalance?: number;
  totalBalanceStart?: number;
  resultForPeriodWithDelta?: number;
  refPaid: (RefPaid | null)[];
}

export type ApisReport = Pick<ReportsApi, "resultForPeriod" | "commission" | "refPaid" | "apiName"> & {
  reportDelta: number;
};

export type ApisReportWithTotalBalanceStart = Pick<
  ReportsApi,
  "resultForPeriod" | "commission" | "refPaid" | "apiName" | "resultForPeriodWithDelta"
>;

export interface WalletReport {
  startDate: string;
  endDate: string;
  email: string;
  username: string | null;
  // chatId: string; потом понадобиться для отправки в телеграм
  apis: ApisReport[];
  totalCommission: number;
}

export interface CommissionUser {
  email: string;
  privateCommission: PrivateCommission;
  userBalance: number;
  balanceForCommissions: number;
  countedCommission: number;
}

export interface LastCommissionUser {
  email: string;
  start: number;
  to: number;
}

export interface CommissionApi {
  email: string;
  apiName: string;
  privateCommission: PrivateCommission;
  apiBalance: number;
}

export interface UserReportData {
  apiArray: ApiByApi[];
  start: number;
  to: number;
}

export interface ApiReportData {
  api: ApiByApi;
  start: number;
  to: number;
}

export interface ApiReportBase {
  apiName: string;
  market: string;
  email: string;
  startDate: string;
  endDate: string;
  startBalance: number | null;
  startPnl: number | null;
  startAvailBalance: number | null;
  endBalance: number | null;
  endPnl: number | null;
  endAvailBalance: number | null;
  commissionInfo: PrivateCommission;
}
export interface ApiPnlReportBase {
  apiName: string;
  market: string;
  email: string;
  startDate: string;
  endDate: string;
  startPnl: number | null;
  endPnl: number | null;
  cumulativePnl: number | null;
  commissionInfo: PrivateCommission;
  totalBalance?: number;
  totalBalanceStart?: number;
}

export interface ApiReport extends ApiReportBase {
  depositsSum: number | null;
  withdrawalsSum: number | null;
  totalResult: number | null;
  commissionVal: number | null;
  cumulativePnl: number | null;
  isTransferable: boolean;
}

export interface ApiPnlReport extends ApiPnlReportBase {
  commissionVal: number | null;
  cumulativePnl: number | null;
}

export interface TotalReport {
  startBalance: number;
  endBalance: number;
  commission: number;
  depositsSum: number;
  withdrawalsSum: number;
  cumulativePnl: number;
  fullResult: number;
}

export interface TotalPnlReport {
  commission: number;
  cumulativePnl: number;
  pnlDelta: number;
}

export interface DataResponse<T> {
  status: boolean;
  error?: string[];
  data?: T;
  message?: string[];
}

export interface SendTransactionDto {
  email: string;
  amount: number;
  tgAccount?: string;
  tgUserName?: string;
  explanation: string;
  refPaid: (RefPaid | null)[];
  start: number;
  to: number;
}

export interface RefPaid {
  email: string;
  amount: number;
  explanation: string;
}

export interface RefId {
  levelName: string;
  email: string;
  tgUserName: string;
  tgAccount: string;
}

export interface ReferrerData {
  userEmail: string;
  refId: {
    firstLevel: RefId;
    secondLevel: RefId;
    thirdLevel: RefId;
  };
  supportRefId: string;
}
export interface Referrer {
  status: boolean;
  data: ReferrerData[];
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

export interface CancelOrder {
  symbol: string;
  orderId: string;
  price: number | string;
  side: string;
  amount: number | string;
  leverage: number | string;
}
