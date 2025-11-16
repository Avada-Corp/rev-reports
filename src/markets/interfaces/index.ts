import { WalletBalanceV5Coin } from "bybit-api";
import { PrivateCommission } from "../reports/interfaces";
import { Side } from "../helpers/exchange";

export enum Market {
  Binance = "Binance",
  Bybit = "Bybit",
  Bitget = "Bitget",
  Huobi = "Huobi",
  OKX = "OKX"
}

export interface ApiByApi {
  email: string;
  key: string;
  secret: string;
  name: string;
  pass?: string;
  id: string;
  rev_id_orig: string;
  market: Market;
  commissionType: "weekly" | "monthly";
  privateCommission: PrivateCommission;
}

export interface ApiByApiWithUpdatedAt extends ApiByApi {
  updatedAt: number;
  expirationDate: number;
}

export interface ResponseInterface<T> {
  errors?: string[];
  messages?: string[];
  status: boolean;
  data?: T;
}

export enum Period {
  Week,
  Month
}

export interface Balance {
  total: number | null;
  pnl: number | null;
  retMsg?: string;
  type?: string;
  balanceResponse?: unknown | undefined;
}

export interface Transfers {
  deposits: number[];
  withdrawals: number[];
}
export interface TransferHistory {
  transfers: Transfers | null;
  retMsg?: string;
}

export interface Row {
  timestamp: number;
  asset: string;
  amount: string;
  type: number;
  status: string;
  tranId: number;
}

export const markets = {
  29: "Binance",
  37: "Bitget",
  42: "Bybit",
  43: "Huobi",
  33: "OKX"
};

export interface ApiDataUser extends ApiData {
  username: string;
  market: string;
  name: string;
  key: string;
}

export interface ApiData {
  prevPnl: number | null;
  prevTotalBalance: number | null;
  history: TransferHistory;
  curPnl: number | null;
  curTotalBalance: number | null;
  start: number;
  to: number;
  cumulativePnl: number;
}

export interface ApiPnlData {
  prevPnl: number | null;
  curPnl: number | null;
  start: number;
  to: number;
  cumulativePnl: number;
  totalBalance?: number;
  totalBalanceStart?: number;
}

export interface Rep {
  _id: string;
  keyId: string;
  start: number;
  to: number;
  __v: number;
  pnl: null | number;
  totalBalance: null | number;
  transfers: Transfers | null;
  pnlDaily: null | number;
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

export interface ApisReportWithTotalBalanceStart extends ReportsApi {
  totalBalanceStart?: number;
}

export interface CommissionUser {
  email: string;
  privateCommission: PrivateCommission;
  userBalance: number;
  balanceForCommissions: number;
  countedCommission: number;
}

export interface ApiReportForCheck {
  apiName: string;
  startBalance: number;
  endBalance: number;
  startPnl: number;
  endPnl: number;
  realizedPnl: number;
  pnlDelta: number;
  totalProfit: number;
  totalProfitWithDelta: number;
  lastApiDelta: number;
  commission: number;
  commissionSource: string;
  refPaid: Array<{
    username: string;
    email: string;
    amount: number;
    explanation: string;
  }>;
  totalRefPaid: number;
  reportsCount: number;
  reports: ReportForCheck[];
}

export interface ReportForCheck {
  email: string;
  keyName: string;
  start: number;
  to: number;
  pnl: number;
  pnlDaily: number;
  totalBalance: number;
}

export interface CheckCommissionsResponse {
  status: boolean;
  error?: string;
  data?: {
    userEmail: string;
    username: string;
    startDate: string;
    endDate: string;
    commissionSettings: {
      privatePercent: number | null;
      privateAbsolute: number | null;
      countedCommission: number;
      balanceForCommissions: number;
    };
    totalCommissionByApis: number;
    finalTotalCommission: number;
    apis: ApiReportForCheck[];
    summary: {
      totalApis: number;
      totalReports: number;
      totalStartBalance: number;
      totalEndBalance: number;
      totalRealizedPnl: number;
      totalPnlDelta: number;
      totalRefPaid: number;
    };
  };
}

export interface CheckCommissionsRequest {
  email: string;
  startDate: number;
  endDate: number;
}

export interface ClosePositionRequest {
  apiRevId: string;
  symbol: string;
  positionAmt: number;
  entryPrice: number;
  markPrice: number;
  unRealizedProfit: number;
  liquidationPrice: number;
  leverage: number;
  marginType: string;
  positionSide: Side;
  updateTime: number;
}

export interface CancelOrderRequest {
  apiRevId: string;
  symbol: string;
  price: number | string;
  side: Side;
  amount: number | string;
  leverage: number | string;
  orderId: string;
}

export interface GetUserReportRequest {
  email: string;
  from: number;
  to: number;
  isStartModify?: boolean;
}

export interface NikitaApiData {
  api_id: string;
  api_name: string;
  api_key: string;
  api_uid: number;
  liquidated_amount: number;
}

export interface NikitaResponse {
  status: boolean;
  data?: NikitaApiData[];
  error?: string;
}
