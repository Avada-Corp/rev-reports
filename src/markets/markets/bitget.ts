import { Exchange, IncomeHistoryRecord, OpenOrder, Side } from "../helpers/exchange";
import { Balance, TransferHistory } from "../interfaces/index";
import { FuturesClient, RestClientV2, SpotClient } from "bitget-api";
import { Logger } from "@nestjs/common";

export class Bitget extends Exchange {
  private restClientV2: RestClientV2;
  private spotClient: SpotClient;
  private futuresClient: FuturesClient;

  constructor(protected readonly key: string, protected readonly secret: string, protected readonly pass: string) {
    super(key, secret);
    try {
      this.restClientV2 = new RestClientV2({
        apiKey: key,
        apiSecret: secret,
        apiPass: pass
      });
      this.spotClient = new SpotClient({
        apiKey: key,
        apiSecret: secret,
        apiPass: pass
      });
      this.futuresClient = new FuturesClient({
        apiKey: key,
        apiSecret: secret,
        apiPass: pass
      });
    } catch (error) {
      console.error("error: ", error);
    }
  }

  async getTransferHistory(startTime: number, endTime: number): Promise<TransferHistory> {
    const deposits: number[] = [];
    const withdrawals: number[] = [];
    try {
      const base = {
        coinId: 2
      };
      const accountTypes = [
        // "EXCHANGE",
        // "CONTRACT",
        "OTC"
        // "USD_MIX",
        // "USDC_MIX",
        // "MARGIN_CROSS",
        // "MARGIN_ISOLATED",
      ];
      const enum Types {
        Exchange = "EXCHANGE",
        Otc = "OTC",
        UsdtM = "USDT_MIX"
      }
      // const balPromises = accountTypes.map((a) =>
      //   this.spotClient.getTransferHistory({
      //     ...base,
      //     fromType: a,
      //   }),
      // );
      // const balRes = await Promise.all(balPromises);
      const deps = await this.spotClient.getTransferHistory({
        ...base,
        fromType: Types.Otc
      });
      const withs = await this.spotClient.getTransferHistory({
        ...base,
        fromType: Types.UsdtM
      });
      for (const { amount, toType } of deps.data.filter(
        (d) => Number(d.tradeTime) < endTime && Number(d.tradeTime) > startTime
      )) {
        if (toType === Types.UsdtM) {
          deposits.push(Number(amount));
        }
      }
      for (const { amount, toType } of withs.data.filter(
        (d) => Number(d.tradeTime) < endTime && Number(d.tradeTime) > startTime
      )) {
        if (toType === Types.Exchange) {
          withdrawals.push(Number(amount));
        }
      }
    } catch (error) {
      console.error("getTransferHistory bitget error: ", error);
      if ((error as any)?.body?.code === "40014") {
        return { transfers: null };
      }
    }
    return { transfers: { deposits, withdrawals } };
  }

  async showOrderHistory({ start, to }) {
    const limit = 20;
    let endId: string | null = null;
    do {
      const req: any = {
        productType: "USDT-FUTURES",
        limit,
        startTime: start,
        endTime: to,
        symbol: "ARBUSDT"
      };
      if (endId != null) {
        req.idLessThan = endId;
      }
      const res = (await this.restClientV2.getFuturesHistoricOrders(req)).data;
      console.info(
        "res: ",
        res.entrustedList?.map((e) => ({
          price: e.price,
          size: e.size,
          vol: Number(e.price) * Number(e.size),
          creationDate: new Date(Number(e.cTime)),
          updateDate: new Date(Number(e.uTime))
        }))
      );
      endId = res.endId;
    } while (endId != null);
    return 0;
  }

  async getPnl({ start, to }) {
    const limit = 20;
    let endId: string | null = null;
    let pnl = 0;
    do {
      const req: any = {
        productType: "USDT-FUTURES",
        limit,
        startTime: start,
        endTime: to
      };
      if (endId != null) {
        req.idLessThan = endId;
      }
      const res = (await this.restClientV2.getFuturesHistoricPositions(req)).data;
      pnl += res.list.reduce((a, b) => Number(b.netProfit) + a, 0);
      endId = res.endId;
    } while (endId != null);
    return pnl;
  }

  async getBalance(): Promise<Balance | null> {
    try {
      const balRest = await this.restClientV2.getFuturesAccountAssets({ productType: "USDT-FUTURES" });
      const usdtInfo = balRest.data[0];
      return {
        total: Number(usdtInfo.available),
        pnl: Number(usdtInfo.unrealizedPL),
        balanceResponse: usdtInfo
      };
    } catch (error) {
      Logger.error("GetBalance error: ", error);
      return null;
    }
  }

  async checkApiIsValid() {
    // const balRest = await this.restClientV2.getFuturesAccountAssets();
    return true;
  }

  async getOpenPositions(pairs: string[] = []) {
    try {
      const futuresPositions = await this.restClientV2.getFuturesPositions({ productType: "USDT-FUTURES" });
      const openOrders = await this.getOpenOrders(pairs);
      console.log("openOrders: ", openOrders.data.length);
      // const openPositions = await this.restClient.getPositionInfo({
      //   category: "linear"
      // });
      console.log("Bitget futuresPositions.data: ", futuresPositions.data.length);
      const positions = futuresPositions.data.map((b) => ({
        symbol: b.symbol,
        side: b.holdSide === "long" ? Side.Long : Side.Short,
        size: b.total,
        marginSize: b.marginSize,
        leverage: b.leverage,
        unrealizedPL: b.unrealizedPL,
        liquidationPrice: b.liquidationPrice,
        markPrice: b.markPrice,
        openPriceAvg: b.openPriceAvg,
        marginType: b.posMode
      }));
      return { positions, openOrders: openOrders.data };
    } catch (error) {
      console.log("error: ", error);
      return { positions: [], openOrders: [] };
    }
  }

  async closePosition(symbol: string, side: Side): Promise<{ status: boolean; message: string }> {
    console.log("closePosition Bitget: ", symbol, side);
    try {
      const res = await this.restClientV2.futuresFlashClosePositions({
        productType: "USDT-FUTURES",
        symbol,
        holdSide: side === Side.Long ? "long" : "short"
      });
      console.log("closePosition symbol data: ", res.data);
      return { status: true, message: res.msg };
    } catch (error) {
      console.log("error: ", error);
      return { status: false, message: error.message || "Some error" };
    }
  }

  async getOpenOrders(pairs: string[] = []): Promise<{ status: boolean; message: string; data: OpenOrder[] }> {
    const orders = await this.restClientV2.getFuturesOpenOrders({ productType: "USDT-FUTURES" });
    return {
      status: true,
      message: "success",
      data: orders.data.entrustedList.map((o) => ({
        symbol: o.symbol,
        side: o.side === "buy" ? Side.Long : Side.Short,
        size: o.size,
        price: o.price,
        leverage: o.leverage,
        orderId: o.orderId,
        amount: Number(o.price) * Number(o.size)
      }))
    };
  }

  async cancelOrder(symbol: string, orderId: string): Promise<{ status: boolean; message: string }> {
    console.log("cancelOrderBitget: ", symbol, orderId);
    try {
      const order = await this.restClientV2.futuresCancelOrder({ productType: "USDT-FUTURES", orderId, symbol });
      console.log("order: ", order);
      return { status: true, message: order.msg };
    } catch (error) {
      console.log("error: ", error);
      return { status: false, message: error.message || "Some error" };
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
    const limit = 100;
    let endId: string | null = null;

    // Кешируем позиции один раз (оптимизация: 1 запрос вместо N)
    let positionsCache: any[] = [];
    try {
      const openPositions = await this.restClientV2.getFuturesPositions({
        productType: "USDT-FUTURES"
      });
      positionsCache = openPositions.data || [];
    } catch (e) {
      console.warn("Failed to fetch positions cache for Bitget");
    }

    try {
      do {
        const req: any = {
          productType: "USDT-FUTURES",
          limit,
          startTime: start,
          endTime: to
        };
        if (endId != null) {
          req.idLessThan = endId;
        }

        const res = (await this.restClientV2.getFuturesHistoricPositions(req)).data;
        console.log("Bitget getFuturesHistoricPositions response: ", JSON.stringify(res, null, 2));

        // Логируем структуру первого элемента для отладки
        if (res.list && res.list.length > 0) {
          console.log("First position structure: ", JSON.stringify(res.list[0], null, 2));
        }

        for (const position of res.list || []) {
          // @ts-ignore
          // Используем правильные поля из API Bitget
          const executedAt = Number(position.utime);
          console.log("executedAt: ", executedAt);
          // @ts-ignore
          const createdAt = Number(position.ctime);
          console.log("createdAt: ", createdAt);

          // Фильтруем только сделки, закрытые в указанном периоде
          if (executedAt < start || executedAt > to) {
            continue;
          }

          // Отладочная информация для каждого поля
          console.log(`Position ${position.symbol} fields:`, {
            uTime: position.uTime,
            cTime: position.cTime,
            openAvgPrice: position.openAvgPrice,
            closeAvgPrice: position.closeAvgPrice,
            netProfit: position.netProfit,
            closeTotalPos: (position as any).closeTotalPos,
            // Проверяем все доступные поля
            allFields: Object.keys(position)
          });

          // Используем кешированные позиции
          let liquidationPrice = "0";
          const matchingPosition = positionsCache.find((p: any) => p.symbol === position.symbol);
          if (matchingPosition?.liquidationPrice) {
            liquidationPrice = matchingPosition.liquidationPrice;
          }

          result.push({
            orderId: position.positionId || (position as any).posId || (position as any).orderId || "N/A",
            symbol: position.symbol || "N/A",
            createdAt: createdAt || 0,
            executedAt: executedAt || 0,
            liquidationPrice,
            entryPrice: position.openAvgPrice || "0",
            executionPrice: position.closeAvgPrice || "0",
            quantity: (position as any).closeTotalPos || "0",
            income: position.netProfit || "0",
            asset: "USDT",
            incomeType: "REALIZED_PNL"
          });
        }

        endId = res.endId;
      } while (endId != null);
    } catch (error) {
      console.error("getIncomeHistory Bitget error: ", error);
    }

    return result;
  }
}
