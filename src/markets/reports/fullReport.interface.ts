import { Types } from "mongoose";

export interface FullReport {
  _id: Types.ObjectId;
  keyId: string;
  start: number;
  to: number;
  balanceResponse: string;
  pnl: number;
  pnlDaily: number;
  snapshotTime: number;
  apiName: string;
  username: string;
  keyName: string;
  tgAccount: string;
  transfers: Transfers;
  totalBalance: number;
  api: Api;
}

export interface PeriodReport {
  username: string;
  apiName: string;
  start: number;
  to: number;
  transfers: Transfers;
  totalBalance: number;
  pnl: number;
  tgAccount: string;
  api: Api;
  pnlDaily: number;
  keyId: string;
}

export interface Transfers {
  deposits: number[];
  withdrawals: number[];
}

export interface Api {
  rev_id: string;
  key: string;
  botIds: BotId[];
  market: string;
  email: string;
  isTransferHistoryAvailable?: boolean;
}

export interface BotId {
  bot_id: string;
  rev_id: string;
  tags: string[];
  _id: Types.ObjectId;
}

// ТОЛЬКО ДЛЯ СОВМЕСТИМОСТИ, НАДО ПИСАТЬ ОБЩИЙ МЕТОД

export interface ApiWithEmail {
  email: string;
  key: string;
  name: string;
  market: string;
  rev_id: string;
  isTransferHistoryAvailable?: boolean;
  botIds: Array<{
    bot_id: string;
    rev_id: string;
  }>;
}

export interface ReportR {
  start: number;
  to: number;
  transfers: Transfers | null;
  notForTransferCount?: boolean;
  totalBalance: number;
  pnl: number;
  pnlDaily: number;
  username: string;
  keyId: string;
  result?: number;
  apiName: string;
  avalBalance: number;
  tgAccount: string;
  api: Omit<ApiWithEmail, "name">;
}

export interface FullReportR {
  start: number;
  to: number;
  transfers: number;
  totalBalance: number;
  pnl: number;
  username: string;
  apiName: string;
  pnlDaily: number | null;
  totalDaily: number | null;
  avalBalance: number;
  avalBalanceStart: number;
  totalBalanceStart: number;
  pnlStart: number;
  isTransferHistoryAvailable: boolean;
  total: number;
  tgAccount: string;
  api: Omit<ApiWithEmail, "name">;
  keyId: string;
}
