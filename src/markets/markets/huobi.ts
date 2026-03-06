import { Exchange, IncomeHistoryRecord, OpenOrder, Side } from "../helpers/exchange";
import * as ccxt from "ccxt";
import { Exchange as CcxtExchange } from "ccxt";
import { Balance, TransferHistory } from "../interfaces/index";
import { Logger } from "@nestjs/common";

export class Huobi extends Exchange {
  private ccxtClient: CcxtExchange;
  constructor(protected readonly key: string, protected readonly secret: string) {
    super(key, secret);
    try {
      this.ccxtClient = new ccxt.huobi({
        apiKey: this.key,
        secret: this.secret
      });
    } catch (error) {
      console.error("error : ", error);
    }
  }

  async getTransferHistory(start: number, to: number): Promise<TransferHistory> {
    const deposits: number[] = [];
    const withdrawals: number[] = [];

    const pos = await this.ccxtClient.fetchPositions();
    // try {
    //   const { data }: { data: Transfers } =
    //     await this.client.futuresTransferHistory("USDT", start, {
    //       endTime: to,
    //     });
    //   for (const { type, status, amount } of data.rows || []) {
    //     if (status === BinanceTransferStatuses.CONFIRMED) {
    //       if (type === BinanceTransferTypes.spotToUsdM) {
    //         deposits.push(Number(amount));
    //       } else if (type === BinanceTransferTypes.usdMToSpot) {
    //         withdrawals.push(Number(amount));
    //       }
    //     }
    //   }
    // } catch (error) {
    //   console.error("getTransferHistory error: ", error);
    // }
    return { transfers: { deposits, withdrawals } };
  }
  async showOrderHistory() {
    return null;
  }
  async getPnl({ start, to, pairs }) {
    let sum = 0;
    for (const pair of pairs || []) {
      const contract = pair.toLowerCase().replace("/", "-");
      // https://huobiapi.github.io/docs/usdt_swap/v1/en/#isolated-get-history-orders-new
      // @ts-ignore
      const fetchMyTrades = await this.ccxtClient.contract_private_post_linear_swap_api_v3_swap_cross_hisorders({
        contract,
        trade_type: 0,
        status: 0,
        type: 2, //2:Order in Finished Status
        start_time: start,
        end_time: to
      });
      const tradesData = (fetchMyTrades?.data || []).filter((d) => d.offset === "close").map((d) => d.real_profit);
      sum += tradesData.reduce((a, b) => a + Number(b), 0);
      // contract_private_post_linear_swap_api_v3_swap_hisorders
    }
    return sum;
  }

  async getBalance(): Promise<Balance | null> {
    const fetchDeposits = await this.ccxtClient.fetchDeposits("USDT");
    console.log("fetchDeposits: ", fetchDeposits);

    const fetchWithdrawals = await this.ccxtClient.fetchWithdrawals("USDT");
    console.log("fetchWithdrawals: ", fetchWithdrawals);

    const createBalanceObject = (bal: any): Balance => ({
      total: Number(bal?.USDT?.free),
      pnl: Number(bal?.info?.data?.[0]?.profit_unreal),
      balanceResponse: bal
    });

    // Пытаемся получить баланс через defaultType: "future"
    try {
      const bal = await this.ccxtClient.fetchBalance({
        defaultType: "future"
      });
      // console.log("bal: ", bal);
      console.log("bal?.USDT?: ", bal?.USDT);
      return createBalanceObject(bal);
    } catch (error) {
      Logger.error("GetBalance Huobi error (future): ", error);
      // GetBalance Huobi error:                                                     [Nest] 10428  - 11.05.2025, 14:32:39   ERROR [ExchangeError: huobi {"status":"error","err_code":4002,"err_msg":"The merged cross and isolated margin account for USDT-M futures is unavailable.Please complete the query with linear-swap-api/v3/unified_account_info","ts":1746963158439}]
    }

    // Fallback: используем unified account
    try {
      // @ts-ignore
      const res = await this.ccxtClient.contractPrivateGetLinearSwapApiV3UnifiedAccountInfo();
      const balUsdt = res.data.filter((a) => a.margin_asset === "USDT");
      console.log("res.data: ", res.data);
      console.log("balUsdt: ", balUsdt);
      const { cross_swap, cross_future, isolated_swap, ...cleanBalance } = balUsdt[0];
      return {
        total: Number(balUsdt[0].withdraw_available),
        pnl: Number(balUsdt[0].cross_profit_unreal),
        balanceResponse: cleanBalance
      };
    } catch (error) {
      Logger.error("GetBalance Huobi error (unified): ", error);
      return null;
    }
  }

  async checkApiIsValid() {
    return true;
  }

  async getOpenPositions(pairs: string[]) {
    const openPositions = await this.ccxtClient.fetchPositions();
    const openOrders = await this.getOpenOrders(pairs);
    const positions = openPositions.map((p) => ({
      symbol: p.symbol,
      side: p.side === "long" ? Side.Long : Side.Short,
      size: p.notional,
      marginSize: p.initialMargin,
      leverage: p.leverage,
      unrealizedPL: p.unrealizedProfit,
      liquidationPrice: p.info.liquidationPrice,
      markPrice: p.info.last_price,
      openPriceAvg: p.entryPrice,
      marginType: p.info.position_mode
    }));
    return { positions, openOrders: openOrders.data };
  }

  async closePosition(symbol: string, side: Side): Promise<{ status: boolean; message: string }> {
    console.log("closePosition Huobi: ", symbol, side);
    const openPositions = await this.ccxtClient.fetchPositions([symbol]);
    console.log("openPositions: ", openPositions);
    if (openPositions.length === 0) {
      return { status: false, message: "Position not found" };
    }
    try {
      const position = openPositions.find((p) => p.side === (side === Side.Long ? "long" : "short"));
      console.log("solo position Huobi: ", position);
      const params = {
        contract_code: position.info.contract_code,
        direction: side === Side.Long ? "sell" : "buy"
      };
      console.log("HUOBI params: ", params);
      // @ts-ignore
      const order = await this.ccxtClient.contractPrivatePostLinearSwapApiV1SwapCrossLightningClosePosition(params);
      console.log("HUOBI order: ", order);
      if (order.status === "ok") {
        return { status: true, message: order.status };
      }
      // @ts-ignore
      const order2 = await this.ccxtClient.contractPrivatePostLinearSwapApiV1SwapLightningClosePosition(params);
      console.log("order2: ", order2);
      return { status: true, message: order2.status };
    } catch (error) {
      console.error("closePosition error: ", error);
      return { status: false, message: error.message };
    }
  }

  async getOpenOrders(pairs: string[]): Promise<{ status: boolean; message: string; data: OpenOrder[] }> {
    const res: OpenOrder[] = [];
    for (const pair of pairs) {
      try {
        const orders = await this.ccxtClient.fetchOpenOrders(pair.replace("/", "-"));
        res.push(
          ...orders.map((o) => ({
            symbol: o.symbol,
            price: o.price,
            side: o.side === "buy" ? Side.Long : Side.Short,
            amount: o.amount,
            leverage: o.info.lever_rate,
            orderId: String(o.id)
          }))
        );
      } catch (error) {
        console.error("getOpenOrders error: ", error);
        continue;
      }
    }
    return {
      status: true,
      message: "success",
      data: res
    };
  }

  async cancelOrder(symbol: string, orderId: string): Promise<{ status: boolean; message: string }> {
    console.log("cancelOrderHuobi: ", symbol, orderId);
    try {
      const order = await this.ccxtClient.cancelOrder(orderId, symbol);
      console.log("order: ", order);
      return { status: true, message: "success" };
    } catch (error) {
      console.error("cancelOrderHuobi error: ", error);
      return { status: false, message: error.message };
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

    try {
      // Получаем список всех контрактов пользователя через открытые/закрытые позиции
      let contractSymbols: string[] = [];

      // Попытка 1: Получить из открытых позиций
      try {
        const openPositions = await this.ccxtClient.fetchPositions();
        contractSymbols = openPositions.map((p) => p.symbol).filter(Boolean);
      } catch (e) {
        console.warn("Failed to fetch open positions for Huobi:", e?.message);
      }

      // Попытка 2: Получить из истории сделок за период (используем API v1)
      try {
        // @ts-ignore
        const matchResults = await this.ccxtClient.contract_private_post_linear_swap_api_v1_swap_cross_matchresults({
          trade_type: 0,
          start_time: start,
          end_time: to
        });

        if (matchResults?.data?.trades) {
          const tradesSymbols = matchResults.data.trades
            .map((t: any) => t.contract_code?.replace("-", "/"))
            .filter(Boolean);
          contractSymbols = [...new Set([...contractSymbols, ...tradesSymbols])];
        }
      } catch (e) {
        console.warn("Failed to fetch match results for Huobi:", e?.message);
      }

      // Если не удалось получить контракты, возвращаем пустой массив
      if (contractSymbols.length === 0) {
        console.log("No contracts found for Huobi");
        return result;
      }

      console.log(`Found ${contractSymbols.length} contracts for Huobi:`, contractSymbols);

      // Кешируем текущие открытые позиции для получения liquidationPrice
      let positionsCache: any[] = [];
      try {
        positionsCache = await this.ccxtClient.fetchPositions();
      } catch (e) {
        console.warn("Failed to fetch positions cache for Huobi");
      }

      // Для каждого контракта получаем историю закрытых ордеров
      for (const symbol of contractSymbols) {
        try {
          const contract = symbol.toLowerCase().replace("/", "-");

          // @ts-ignore
          const historyOrders = await this.ccxtClient.contract_private_post_linear_swap_api_v3_swap_cross_hisorders({
            contract,
            trade_type: 0,
            status: 0,
            type: 2, // Order in Finished Status
            start_time: start,
            end_time: to
          });

          const closedOrders = (historyOrders?.data || []).filter((d) => d.offset === "close");

          for (const order of closedOrders) {
            const executedAt = Number(order.update_time || order.created_at);

            // Фильтруем только сделки, закрытые в указанном периоде
            if (executedAt < start || executedAt > to) {
              continue;
            }

            // Получаем цену ликвидации для позиции
            let liquidationPrice = "0";
            const position = positionsCache.find((p) => p.symbol === symbol);
            if (position?.info?.liquidation_price) {
              liquidationPrice = position.info.liquidation_price;
            }

            result.push({
              orderId: order.order_id || order.order_id_str || "N/A",
              symbol: symbol,
              createdAt: Number(order.created_at),
              executedAt,
              liquidationPrice,
              entryPrice: order.trade_avg_price || order.price || "0",
              executionPrice: order.trade_avg_price || "0",
              quantity: order.trade_volume || order.volume || "0",
              income: order.real_profit || "0",
              asset: "USDT",
              incomeType: "REALIZED_PNL"
            });
          }
        } catch (error) {
          console.error(`getIncomeHistory Huobi error for ${symbol}:`, error?.message || error);
          continue;
        }
      }
    } catch (error) {
      console.error("getIncomeHistory Huobi error: ", error);
    }

    return result;
  }
}
