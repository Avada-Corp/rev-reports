import { Exchange, IncomeHistoryRecord, OpenOrder, Position, Side } from "../helpers/exchange";
import { Balance, TransferHistory } from "../interfaces/index";
import { RestClientV5 } from "bybit-api";
import { BybitTransferStatuses } from "../helpers/constants";
import { Logger } from "@nestjs/common";
import okxApi, { OrderHistoryRequest, RestClient } from "okx-api";

export class Okx extends Exchange {
  // private ccxtClient: CcxtExchange;
  private restClient: RestClient;

  constructor(protected readonly key: string, protected readonly secret: string, protected readonly pass: string) {
    super(key, secret);
    this.restClient = new RestClient({
      apiKey: key,
      apiSecret: secret,
      apiPass: pass
    });
  }

  async getTransferHistory(startTime: number, endTime: number): Promise<TransferHistory> {
    const deposits: number[] = [];
    const withdrawals: number[] = [];
    try {
      // TODO getTransferHistory OKX
      const transfers = await this.restClient.getBills({
        type: 1,
        begin: startTime,
        end: endTime
      });
      for (const transfer of transfers) {
        const amt = Number(transfer.sz);
        if (amt > 0) {
          deposits.push(amt);
        } else {
          withdrawals.push(-amt);
        }
      }
    } catch (error) {
      Logger.error("getTransferHistory Okx error: ", error);
    }
    return { transfers: { deposits, withdrawals } };
  }

  async showOrderHistory({ start, to }) {
    // let pnl = 0;
    let incHistory: okxApi.HistoricOrder[] = [];
    const limit = 100;
    let count = 0;
    let afterTime = to;
    const arr: any[] = [];
    try {
      do {
        const req: OrderHistoryRequest = {
          // after: afterTime,
          // @ts-ignore
          begin: 1717612132000,
          limit: limit.toFixed(),
          instType: "SWAP",
          instId: "ICP-USDT-SWAP"
        };
        incHistory = await this.restClient.getOrderHistoryArchive(req);
        const usdtHistory = incHistory.filter((h) => h.instId.includes("ARB"));
        arr.push(
          ...incHistory
            .filter((i) => i.state === "filled")
            .map((u) => {
              return {
                averagePrice: u.avgPx,
                size: u.sz,
                vol: Number(u.sz) * Number(u.avgPx),
                creationDate: new Date(Number(u.cTime)),
                updateDate: new Date(Number(u.uTime))
              };
            })
        );
        // console.info(
        //   "usdtHi2story: ",
        //   incHistory.map((u) => {
        //     return {
        //       averagePrice: u.avgPx,
        //       size: u.sz,
        //       vol: Number(u.sz) * Number(u.avgPx),
        //       creationDate: new Date(Number(u.cTime)),
        //       updateDate: new Date(Number(u.uTime))
        //     };
        //   })
        // );
        if (incHistory.length === limit) {
          afterTime = Number(incHistory[incHistory.length - 1].uTime) - 1;
        } else {
          incHistory = [];
        }
      } while (incHistory.length > 0 && count++ < 0);
    } catch (error) {
      console.error("getPnl binance error: ", error);
    }
    console.info(
      arr
        .filter((a) => a.state === "filled")
        .reduce((a, b) => {
          return a + (b.vol || 0);
        }, 0)
    );
    return 0;
  }

  async getPnl({ start, to }) {
    let pnl = 0;
    let incHistory: okxApi.HistoricAccountPosition[] = [];
    const limit = 100;
    let count = 0;
    let afterTime = to;
    try {
      do {
        // Перепутаны after и before
        // after Pagination of data to return records earlier than the requested uTime
        // before	Pagination of data to return records newer than the requested uTime
        const req = {
          after: afterTime,
          before: start,
          limit: limit.toFixed()
        };
        incHistory = await this.restClient.getPositionsHistory(req);
        const usdtHistory = incHistory.filter((h) => h.ccy === "USDT" && h.type !== "1");
        // @ts-ignore
        pnl += usdtHistory.reduce((a, b) => a + Number(b.realizedPnl), 0);
        if (incHistory.length === limit) {
          afterTime = Number(incHistory[incHistory.length - 1].uTime) - 1;
        } else {
          incHistory = [];
        }
      } while (incHistory.length > 0 && count++ < 100);
    } catch (error) {
      console.error("getPnl binance error: ", error);
    }
    return pnl;
  }
  async getBalance(): Promise<Balance | null> {
    try {
      const bal = await this.restClient.getBalance("USDT");
      const usdtInfo = bal[0].details[0];
      const total = Number(usdtInfo?.cashBal) || 0;
      const pnl = Number(usdtInfo?.upl) || 0;
      return {
        total,
        pnl,
        balanceResponse: bal
      };
    } catch (error) {
      Logger.error("GetBalance error: ", error);
      return null;
    }
  }

  async checkApiIsValid() {
    return true;
  }

  async getOpenPositions(pairs: string[] = []) {
    const openPositions = await this.restClient.getPositions();
    const orders = await this.getOpenOrders(pairs);
    const positions = openPositions.map((p) => ({
      symbol: p.instId,
      side: p.posSide === "long" ? Side.Long : Side.Short,
      size: p.notionalUsd,
      marginSize: p.margin,
      leverage: p.lever,
      unrealizedPL: p.upl,
      liquidationPrice: p.liqPx,
      markPrice: p.markPx,
      openPriceAvg: p.avgPx,
      marginType: p.mgnMode
    }));
    return { positions, openOrders: orders.data };
  }

  async closePosition(symbol: string, side: Side): Promise<{ status: boolean; message: string }> {
    console.log("closePosition Okx: ", symbol, side);
    try {
      // Сначала получаем и отменяем все открытые ордера по данному символу
      const openOrders = await this.getOpenOrders();
      if (openOrders.status && openOrders.data.length > 0) {
        const symbolOrders = openOrders.data.filter((order) => order.symbol === symbol);
        console.log(`Found ${symbolOrders.length} open orders for ${symbol}`);

        for (const order of symbolOrders) {
          try {
            const cancelResult = await this.cancelOrder(symbol, order.orderId.toString());
            console.log(`Cancel order ${order.orderId}:`, cancelResult.message);
          } catch (cancelError) {
            console.error(`Error cancelling order ${order.orderId}:`, cancelError);
          }
        }
      }

      // Затем получаем информацию о позициях
      const positions = await this.restClient.getPositions({ instId: symbol });

      if (!positions || positions.length === 0) {
        return { status: false, message: "No open positions found for this symbol" };
      }

      const results: any[] = [];
      console.log("positions: ", positions);
      for (const position of positions.filter((p) => p.posSide === (side === Side.Long ? "long" : "short"))) {
        console.log("solo position Okx: ", position);
        // Пропускаем позиции с нулевым размером
        if (Number(position.pos) === 0) {
          continue;
        }

        try {
          const close = await this.restClient.closePositions({
            instId: symbol,
            mgnMode: position.mgnMode || "cross",
            posSide: position.posSide
          });
          results.push(close);
        } catch (err) {
          console.error(`Error closing position ${position.posSide}:`, err);
          results.push({ error: err.msg });
        }
      }

      console.log("close results : ", results);
      return { status: true, message: `Closed ${results.filter((r) => r.error != null).length} position(s)` };
    } catch (error) {
      console.error("closePosition Okx error: ", error);
      return { status: false, message: error?.msg || "Error" };
    }
  }
  async getOpenOrders(pairs: string[] = []): Promise<{ status: boolean; message: string; data: OpenOrder[] }> {
    try {
      const orders = await this.restClient.getOrderList();
      return {
        status: true,
        message: "success",
        data: orders.map((o) => ({
          symbol: o.instId,
          price: o.px,
          side: o.side === "buy" ? Side.Long : Side.Short,
          amount: o.sz,
          leverage: o.lever,
          orderId: String(o.ordId)
        }))
      };
    } catch (error) {
      Logger.error("getOpenOrders error: ", error);
      return { status: false, message: error.message || "Unknown error", data: [] };
    }
  }
  async cancelOrder(symbol: string, orderId: string): Promise<{ status: boolean; message: string }> {
    console.log("cancelOrderOkx: ", symbol, orderId);
    try {
      const order = await this.restClient.cancelOrder({ instId: symbol, ordId: orderId });
      console.log("order: ", order);
      return { status: true, message: `${order[0]?.sCode} ${order[0]?.sMsg}` };
    } catch (error) {
      console.error("cancelOrderOkx error: ", error);
      return { status: false, message: error.message || "Unknown error occurred while cancelling order" };
    }
  }
  async getUserInfo(): Promise<number> {
    return 9999;
  }

  async getIncomeHistory(
    incomeType: string,
    { start, to }: { start: number; to: number }
  ): Promise<IncomeHistoryRecord[]> {
    const result: IncomeHistoryRecord[] = [];
    let incHistory: okxApi.HistoricAccountPosition[] = [];
    const limit = 100;
    let count = 0;
    let afterTime = to;

    // Кешируем позиции один раз (оптимизация: 1 запрос вместо N)
    let positionsCache: any[] = [];
    try {
      positionsCache = await this.restClient.getPositions();
    } catch (e) {
      console.warn("Failed to fetch positions cache for OKX");
    }

    try {
      do {
        const req = {
          after: afterTime.toString(),
          before: start.toString(),
          limit: limit.toFixed()
        };

        incHistory = await this.restClient.getPositionsHistory(req);
        const usdtHistory = incHistory.filter((h) => h.ccy === "USDT" && h.type !== "1");

        for (const position of usdtHistory) {
          const executedAt = Number(position.uTime);

          // Фильтруем только сделки, закрытые в указанном периоде
          if (executedAt < start || executedAt > to) {
            continue;
          }

          // Используем кешированные позиции
          let liquidationPrice = "0";
          const matchingPosition = positionsCache.find((p) => p.instId === position.instId);
          if (matchingPosition?.liqPx) {
            liquidationPrice = matchingPosition.liqPx;
          }

          result.push({
            orderId: (position as any).posId || (position as any).pnlId || "N/A",
            symbol: position.instId || "N/A",
            createdAt: Number(position.cTime),
            executedAt,
            liquidationPrice,
            entryPrice: (position as any).openAvgPx || "0",
            executionPrice: (position as any).closeAvgPx || "0",
            quantity: (position as any).closeTotalPos || "0",
            income: (position as any).realizedPnl || position.pnl,
            asset: "USDT",
            incomeType: "REALIZED_PNL"
          });
        }

        if (incHistory.length === limit) {
          afterTime = Number(incHistory[incHistory.length - 1].uTime) - 1;
        } else {
          incHistory = [];
        }
      } while (incHistory.length > 0 && count++ < 100);
    } catch (error) {
      console.error("getIncomeHistory OKX error: ", error);
    }

    return result;
  }
}
