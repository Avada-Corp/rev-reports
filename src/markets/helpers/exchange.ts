import { numberInString } from "bybit-api";
import { Balance, TransferHistory } from "../interfaces/index";
import { IncomeType } from "binance";

export interface IncomeHistoryRecord {
  orderId: string | number;
  symbol: string;
  createdAt: number;
  executedAt: number;
  liquidationPrice: string | number;
  entryPrice: string | number;
  executionPrice: string | number;
  quantity: string | number;
  income: string | number;
  asset: string;
  incomeType: string;
}

export interface IExchange {
  readonly key: string;
  readonly secret: string;
  getBalance(): Promise<Balance | null>;
  getTransferHistory(start: number, to: number): Promise<TransferHistory>;
}

export interface Pnl {
  balance?: Balance | null;
  transfers?: TransferHistory;
  start: number;
  to: number;
  pairs?: string[];
}

type ExchangeNumber = number | string | numberInString;

export interface OpenOrder {
  symbol: string;
  price: ExchangeNumber;
  side: Side;
  amount: ExchangeNumber;
  leverage: ExchangeNumber;
  orderId: ExchangeNumber;
}

export enum Side {
  Long = "long",
  Short = "short"
}

export interface Position {
  symbol: string;
  side: Side;
  size: ExchangeNumber;
  marginSize: ExchangeNumber;
  leverage: ExchangeNumber;
  unrealizedPL: ExchangeNumber;
  liquidationPrice: ExchangeNumber;
  markPrice: ExchangeNumber;
  openPriceAvg: ExchangeNumber;
  marginType: string;
}

export abstract class Exchange {
  constructor(protected readonly key: string, protected readonly secret: string) {}

  abstract getBalance(start?: number, to?: number): Promise<Balance | null>;

  abstract getTransferHistory(start: number, to: number): Promise<TransferHistory>;

  abstract getPnl(data: Pnl): Promise<number | null>;
  abstract checkApiIsValid(): Promise<boolean>;
  abstract showOrderHistory?(data: Pnl): Promise<number | null>;
  abstract getOpenPositions?(pairs: string[]): Promise<{ positions: Position[]; openOrders: OpenOrder[] }>;
  abstract closePosition(symbol: string, side: Side, amount: string): Promise<{ status: boolean; message: string }>;
  abstract getOpenOrders(pairs: string[]): Promise<{ status: boolean; message: string; data: OpenOrder[] }>;
  abstract cancelOrder(symbol: string, orderId: ExchangeNumber): Promise<{ status: boolean; message: string }>;
  abstract getUserInfo(isLog?: boolean): Promise<number>;
  abstract getIncomeHistory(
    incomeType: IncomeType | string,
    { start, to }: { start: number; to: number }
  ): Promise<IncomeHistoryRecord[]>;
}
