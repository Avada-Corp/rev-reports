import { Market } from "../interfaces/index";

export const FeatureMarkets: Record<Market, string> = {
  [Market.Binance]: "binanceusdm",
  [Market.Bitget]: "bitget",
  [Market.Bybit]: "bybit",
  [Market.Huobi]: "huobi",
  [Market.OKX]: "okx"
};

export enum BinanceTransferTypes {
  spotToUsdM = 1,
  usdMToSpot = 2,
  spotToCoinM = 3,
  coinMToSpot = 4
}

export enum BinanceTransferStatuses {
  CONFIRMED = "CONFIRMED"
}

export enum BybitTransferStatuses {
  SUCCESS = "SUCCESS"
}
