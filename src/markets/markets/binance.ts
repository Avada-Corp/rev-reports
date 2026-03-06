import { Exchange, IncomeHistoryRecord, OpenOrder, Side } from "../helpers/exchange";
import * as ccxt from "ccxt";
import { Exchange as CcxtExchange } from "ccxt";
import { Balance, TransferHistory } from "../interfaces/index";
import { Logger } from "@nestjs/common";
import { sendImportantMessageAsync, timeout } from "../helpers";
import { IncomeHistory, IncomeType, NewFuturesOrderParams, USDMClient } from "binance";

interface Transfer {
  symbol: string;
  incomeType: string;
  income: string;
  asset: string;
  time: string;
  info: string;
  tranId: string;
  tradeId: string;
}

export class Binance extends Exchange {
  private usdmClient: USDMClient;

  private ccxtClient: CcxtExchange;
  constructor(protected readonly key: string, protected readonly secret: string) {
    super(key, secret);
    try {
      this.usdmClient = new USDMClient({
        api_key: this.key,
        api_secret: this.secret
      });
      this.ccxtClient = new ccxt.binanceusdm({
        apiKey: this.key,
        secret: this.secret
      });
    } catch (error) {
      console.error("error: ", error);
    }
  }
  async showOrderHistory() {
    return null;
  }

  async getIncomeHistory(
    incomeType: IncomeType,
    { start, to }: { start: number; to: number }
  ): Promise<IncomeHistoryRecord[]> {
    console.log("to: ", new Date(to).toLocaleString());
    console.log("start: ", new Date(start).toLocaleString());

    try {
      // Шаг 1: Получаем income history только для определения активных символов
      const incHistoryArray: IncomeHistory[] = [];
      const limit = 1000;
      let page: IncomeHistory[] = [];
      let nextStart = start;
      let guard = 0;

      do {
        page = await this.usdmClient.getIncomeHistory({
          incomeType: "REALIZED_PNL",
          startTime: nextStart,
          endTime: to,
          limit
        });
        const current = page || [];
        incHistoryArray.push(...current);

        if (page.length === limit) {
          nextStart = page[page.length - 1].time + 1;
        } else {
          page = [];
        }
      } while (page.length > 0 && guard++ < 500);

      // Извлекаем уникальные символы
      const symbolsSet = new Set<string>();
      for (const item of incHistoryArray) {
        if (item?.symbol) symbolsSet.add(item.symbol);
      }
      const symbols = Array.from(symbolsSet);

      console.log(`Found ${symbols.length} unique symbols with activity`);

      // Кешируем позиции один раз
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let positionsCache: any[] = [];
      try {
        positionsCache = await this.usdmClient.getPositionsV3();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        console.warn("Failed to fetch positions cache", e?.message || e);
      }

      // Шаг 2: Получаем trades для каждого символа (содержат все нужные данные)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allTrades: any[] = [];
      const TRADE_WINDOW = 7 * 24 * 60 * 60 * 1000; // 7 days window (API ограничение)

      for (const symbol of symbols) {
        // Разбиваем период на окна по 7 дней
        for (let windowStart = start; windowStart <= to; windowStart += TRADE_WINDOW) {
          const windowEnd = Math.min(to, windowStart + TRADE_WINDOW - 1);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let tradesChunk: any[] = [];
          let fromId: number | undefined = undefined;
          let tradeGuard = 0;

          do {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const params: any = { symbol, startTime: windowStart, endTime: windowEnd, limit: 1000 };
            if (fromId != null) params.fromId = fromId;

            // @ts-ignore
            tradesChunk = await this.usdmClient.getAccountTrades(params);
            if (Array.isArray(tradesChunk) && tradesChunk.length > 0) {
              allTrades.push(...tradesChunk);
              if (tradesChunk.length === 1000) {
                const last = tradesChunk[tradesChunk.length - 1];
                fromId = (last?.id || 0) + 1;
              } else {
                tradesChunk = [];
              }
            } else {
              tradesChunk = [];
            }
          } while (Array.isArray(tradesChunk) && tradesChunk.length > 0 && tradeGuard++ < 500);
        }
      }

      console.log(`Fetched ${allTrades.length} trades`);

      // Шаг 3: Группируем trades по orderId
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const orderMap = new Map<number, any[]>();
      for (const trade of allTrades) {
        const orderId = trade.orderId;
        if (!orderMap.has(orderId)) {
          orderMap.set(orderId, []);
        }
        const orderTrades = orderMap.get(orderId);
        if (orderTrades) {
          orderTrades.push(trade);
        }
      }

      // Шаг 4: Формируем результат из сгруппированных trades
      const result: IncomeHistoryRecord[] = [];
      for (const [orderId, trades] of orderMap.entries()) {
        const firstTrade = trades[0];
        const lastTrade = trades[trades.length - 1];

        // Вычисляем средневзвешенную цену исполнения и общий PnL
        let totalQty = 0;
        let totalValue = 0;
        let realizedPnl = 0;

        for (const trade of trades) {
          const qty = Math.abs(Number(trade.qty));
          const price = Number(trade.price);
          totalQty += qty;
          totalValue += qty * price;
          realizedPnl += Number(trade.realizedPnl);
        }

        const avgPrice = totalQty > 0 ? totalValue / totalQty : 0;

        // Получаем цену ликвидации для символа
        let liquidationPrice = "0";
        const position = positionsCache.find((p) => p.symbol === firstTrade.symbol);
        if (position?.liquidationPrice) {
          liquidationPrice = String(position.liquidationPrice);
        }

        result.push({
          orderId: orderId.toString(),
          symbol: firstTrade.symbol || "N/A",
          createdAt: Number(firstTrade.time),
          executedAt: Number(lastTrade.time),
          liquidationPrice,
          entryPrice: String(firstTrade.price),
          executionPrice: String(avgPrice.toFixed(8)),
          quantity: String(totalQty),
          income: String(realizedPnl),
          asset: firstTrade.commissionAsset || "USDT",
          incomeType: "REALIZED_PNL"
        });
      }

      console.log(`Returning ${result.length} orders`);
      return result;
    } catch (error) {
      console.error("getIncomeHistory binance error: ", error);
      return [];
    }
  }

  async getTradeInfo(incomeType: IncomeType, { start, to }: { start: number; to: number }) {
    let value = 0;
    let incHistory: IncomeHistory[] = [];
    const limit = 1000;
    let count = 0;
    let startTime = start;
    try {
      do {
        incHistory = await this.usdmClient.getIncomeHistory({
          incomeType,
          startTime,
          endTime: to,
          limit
        });
        const usdtHistory = incHistory.filter((h) => h.asset === "USDT" || h.asset === "BNFCR");
        value += usdtHistory.reduce((a, b) => a + Number(b.income), 0);
        if (incHistory.length === limit) {
          startTime = incHistory[incHistory.length - 1].time + 1;
        } else {
          incHistory = [];
        }
      } while (incHistory.length > 0 && count++ < 10);
      return value;
    } catch (error) {
      console.error("getPnl binance error: ", error);
      return 0;
    }
  }

  /**
   * Returns all futures trades (fills) for provided symbols in the time range.
   * If symbols are not provided, derives symbols from income history (REALIZED_PNL).
   */
  async getTrades({ start, to, symbols }: { start: number; to: number; symbols?: string[] }) {
    try {
      let targetSymbols = symbols;
      if (targetSymbols == null || targetSymbols.length === 0) {
        const income = await this.getIncomeHistory("REALIZED_PNL", { start, to });
        const set = new Set<string>();
        for (const h of income) {
          if (h?.symbol) set.add(h.symbol);
        }
        targetSymbols = Array.from(set);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allTrades: any[] = [];
      for (const symbol of targetSymbols || []) {
        const WINDOW = 7 * 24 * 60 * 60 * 1000; // 7 days window
        for (let windowStart = start; windowStart <= to; windowStart += WINDOW) {
          const windowEnd = Math.min(to, windowStart + WINDOW - 1);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let tradesChunk: any[] = [];
          let fromId: number | undefined = undefined;
          let guard = 0;
          do {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const params: any = { symbol, startTime: windowStart, endTime: windowEnd, limit: 1000 };
            if (fromId != null) params.fromId = fromId;
            // @ts-ignore
            tradesChunk = await this.usdmClient.getAccountTrades(params);
            if (Array.isArray(tradesChunk) && tradesChunk.length > 0) {
              allTrades.push(...tradesChunk.map((t) => ({ ...t, symbol })));
              if (tradesChunk.length === 1000) {
                const last = tradesChunk[tradesChunk.length - 1];
                fromId = (last?.id || last?.tradeId || 0) + 1;
              } else {
                tradesChunk = [];
              }
            }
          } while (Array.isArray(tradesChunk) && tradesChunk.length > 0 && guard++ < 500);
        }
      }
      return allTrades;
    } catch (error) {
      console.error("getTrades binance error: ", error);
      return [];
    }
  }

  async getPnl({ start, to }) {
    const pnlVal = await this.getTradeInfo("REALIZED_PNL", { start, to });
    await timeout(1500);
    const commissionVal = await this.getTradeInfo("COMMISSION", { start, to });
    await timeout(1500);
    const fundingVal = await this.getTradeInfo("FUNDING_FEE", { start, to });
    await timeout(1500);
    return pnlVal + commissionVal + fundingVal;
  }

  async getTransferHistory(start: number, to: number): Promise<TransferHistory> {
    const deposits: number[] = [];
    const withdrawals: number[] = [];
    try {
      // @ts-ignore
      const transfers: Transfer[] = await this.ccxtClient.fapiPrivateGetIncome({
        incomeType: "TRANSFER",
        startTime: start,
        endTime: to
      });
      for (const { income, asset } of transfers || []) {
        if (asset === "USDT") {
          if (Number(income) > 0) {
            deposits.push(Number(income));
          } else {
            withdrawals.push(Number(-income));
          }
        }
      }
    } catch (error) {
      Logger.error("getTransferHistory error: ", error);
    }
    return { transfers: { deposits, withdrawals } };
  }

  async getBalance(): Promise<Balance | null> {
    try {
      let res: Balance | null = null;
      let counter = 10;
      do {
        const info = (await this.ccxtClient.fetchBalance("USDT")).info;
        const { totalWalletBalance, totalUnrealizedProfit } = info;
        if (totalWalletBalance != null && totalUnrealizedProfit != null) {
          res = {
            total: Number(totalWalletBalance),
            pnl: Number(totalUnrealizedProfit)
            // balanceResponse: info
          };
        }
        counter--;
        if (res == null) {
          await timeout(2000);
        }
      } while (res == null || counter === 0);
      if (res == null) {
        await sendImportantMessageAsync(`Не смогли получить баланс счета ${this.key} с 10 попыток`);
      }
      return res;
    } catch (error) {
      console.error("GetBalance error: ", error);
      return null;
    }
  }

  async checkApiIsValid() {
    const result = await this.ccxtClient.fetchBalance("USDT");
    console.info("result: ", result.info.canTrade);
    return true;
  }
  async getOpenPositions(pairs: string[] = []) {
    const openPositions = await this.usdmClient.getPositionsV3();
    console.log("openPositions: ", openPositions);
    const orders = await this.getOpenOrders(pairs);
    const positions = openPositions.map((o) => ({
      symbol: o.symbol,
      side: o.positionSide === "LONG" ? Side.Long : Side.Short,
      size: o.notional,
      marginSize: o.initialMargin,
      leverage: 0,
      unrealizedPL: o.unRealizedProfit,
      liquidationPrice: o.liquidationPrice,
      markPrice: o.markPrice,
      openPriceAvg: o.entryPrice,
      marginType: "Unknown",
      amount: o.positionAmt
    }));
    console.log("positions: ", positions);
    return { positions, openOrders: orders.data };
  }

  async closePosition(symbol: string, side: Side, amount: string): Promise<{ status: boolean; message: string }> {
    console.log("closePosition Binance: ", symbol, side, amount);
    try {
      const params: NewFuturesOrderParams<number> = {
        symbol,
        side: side === Side.Long ? "SELL" : "BUY",
        positionSide: side === Side.Long ? "LONG" : "SHORT",
        type: "MARKET",
        quantity: Math.abs(Number(amount))
      };
      console.log("params: ", params);
      const order = await this.usdmClient.submitNewOrder(params);
      console.log("order: ", order);
      return { status: true, message: order.status };
    } catch (error) {
      console.error("closePosition error: ", error);
      return { status: false, message: error.message };
    }
  }
  async getOpenOrders(_pairs: string[] = []): Promise<{ status: boolean; message: string; data: OpenOrder[] }> {
    const orders = await this.usdmClient.getAllOpenOrders();
    return {
      status: true,
      message: "success",
      data: orders.map((o) => ({
        symbol: o.symbol,
        price: o.price,
        side: o.side === "BUY" ? Side.Long : Side.Short,
        amount: o.origQty,
        leverage: 0,
        orderId: o.orderId
      }))
    };
  }
  async cancelOrder(symbol: string, orderId: string): Promise<{ status: boolean; message: string }> {
    console.log("cancelOrderBinance: ", symbol, orderId);
    try {
      const order = await this.usdmClient.cancelOrder({ symbol, orderId: orderId as any });
      console.log("order: ", order);
      return { status: true, message: order.status };
    } catch (error) {
      console.error("cancelOrder error: ", error);
      return { status: false, message: error.message };
    }
  }
  async getUserInfo(): Promise<number> {
    return 9999;
  }
}
