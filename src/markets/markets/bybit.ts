import { Exchange, IncomeHistoryRecord, OpenOrder, Position, Side } from "../helpers/exchange";
import { Balance, TransferHistory } from "../interfaces/index";
import { AccountOrderV5, OrderParamsV5, RestClientV5 } from "bybit-api";
import { BybitTransferStatuses } from "../helpers/constants";
import { Logger } from "@nestjs/common";

export class Bybit extends Exchange {
  // private ccxtClient: CcxtExchange;
  private restClient: RestClientV5;

  constructor(protected readonly key: string, protected readonly secret: string) {
    super(key, secret);
    try {
      this.restClient = new RestClientV5({
        key: this.key,
        secret: this.secret
      });
    } catch (error) {
      console.error("error: ", error);
    }
  }

  async showOrderHistory() {
    return null;
  }
  async getPnl({ start, to }) {
    let resultPnl = 0;
    let nextPageCursor: string | undefined = undefined;
    do {
      try {
        const pnlData = await this.restClient.getClosedPnL({
          category: "linear",
          startTime: start,
          endTime: to,
          limit: 100,
          cursor: nextPageCursor
        });
        nextPageCursor = pnlData?.result?.nextPageCursor || "";
        const pnlList = pnlData?.result?.list || [];
        resultPnl += pnlList.reduce((acc, pnl) => (acc += Number(pnl.closedPnl)), 0);
      } catch (error) {
        nextPageCursor = "";
        console.error("Get pnl error: ", error);
      }
    } while (nextPageCursor !== "");
    return resultPnl;
  }

  async getTransferHistory(startTime: number, endTime: number): Promise<any> {
    const deposits: number[] = [];
    const withdrawals: number[] = [];
    let retMsg = "";
    let retCode = 0;
    try {
      const internalTransfers = await this.restClient.getInternalTransferRecords({
        coin: "USDT",
        status: BybitTransferStatuses.SUCCESS,
        startTime,
        endTime
      });
      const universalTransfers = await this.restClient.getUniversalTransferRecords({
        coin: "USDT",
        status: BybitTransferStatuses.SUCCESS,
        startTime,
        endTime
      });
      retMsg = internalTransfers.retMsg;
      retCode = internalTransfers.retCode;
      const internal = internalTransfers?.result?.list || [];
      console.info("internal: ", internal.length);
      console.info(
        internal.map(
          (a) =>
            `${a.fromAccountType} -> ${a.toAccountType} ${a.amount}USDT: ${new Date(
              Number(a.timestamp)
            ).toLocaleDateString()} - ${new Date(Number(a.timestamp)).toLocaleTimeString()}`
        )
      );
      const internalContractTransfer = internal.filter(
        (t) =>
          t.fromAccountType === "CONTRACT" ||
          t.toAccountType === "CONTRACT" ||
          t.fromAccountType === "UNIFIED" ||
          t.toAccountType === "UNIFIED"
      );
      const universal = universalTransfers?.result?.list || [];
      console.log("universal: ", universal);
      const universalContractTransfer = universal.filter(
        (t) =>
          t.fromAccountType === "CONTRACT" ||
          t.toAccountType === "CONTRACT" ||
          t.fromAccountType === "UNIFIED" ||
          t.toAccountType === "UNIFIED"
      );

      for (const { fromAccountType, amount, toAccountType } of [
        ...internalContractTransfer,
        ...universalContractTransfer
      ]) {
        if (
          (toAccountType === "CONTRACT" && fromAccountType !== "CONTRACT") ||
          (toAccountType === "UNIFIED" && fromAccountType !== "UNIFIED")
        ) {
          deposits.push(Number(amount));
        } else if (
          (toAccountType !== "CONTRACT" && fromAccountType === "CONTRACT") ||
          (toAccountType !== "UNIFIED" && fromAccountType === "UNIFIED")
        ) {
          withdrawals.push(Number(amount));
        }
      }
    } catch (error) {
      Logger.error("getTransferHistory Bybit error: ", error);
    }
    return retCode === 10005 ? { transfers: null, retMsg } : { transfers: { deposits, withdrawals }, retMsg };
  }

  async getUserInfo(isLog = false) {
    if (isLog) {
      console.log("============= ПЕРСОНАЛЬНАЯ ИНФОРМАЦИЯ BYBIT АККАУНТА =============");
      // 1. Получаем информацию о API ключе (содержит персональные данные)
      console.log("\n🔑 ИНФОРМАЦИЯ О API КЛЮЧЕ И ПОЛЬЗОВАТЕЛЕ:");
    }
    let days = 999;
    try {
      const apiKeyInfo = await this.restClient.getQueryApiKey();
      // console.log("API Key Info:", JSON.stringify(apiKeyInfo, null, 2));
      const result = apiKeyInfo.result;
      // console.log("result: ", result);

      // Выводим ключевые персональные данные отдельно для удобства
      if (result?.userID) {
        if (isLog) {
          console.log("\n📋 ПЕРСОНАЛЬНЫЕ ДАННЫЕ:");
          console.log(`👤 User ID: ${result.userID}`);
          console.log(`🏠 Parent UID: ${result.parentUid}`);
          console.log(`👑 VIP Level: ${result.vipLevel}`);
          console.log(`📊 Market Maker Level: ${result.mktMakerLevel}`);
          console.log(`🆔 KYC Level: ${result.kycLevel}`);
          console.log(`🌍 KYC Region: ${result.kycRegion}`);
          console.log(`🎯 Inviter ID: ${result.inviterID}`);
          console.log(`🤝 Affiliate ID: ${result.affiliateID}`);
          console.log(`👨‍💼 Is Master Account: ${result.isMaster}`);
          console.log(`📈 UTA Account: ${result.uta === 1 ? "Yes" : "No"}`);
          console.log(`📅 Created At: ${result.createdAt}`);
          console.log(`⚠️ Expires At: ${result.expiredAt}`);
          console.log(`📆 Days Until Expiry: ${result.deadlineDay}`);
        }
        days = result.deadlineDay;
      } else {
        days = -100;
      }
    } catch (error) {
      console.log("API Key Info недоступен:", error.message);
    }

    if (isLog) {
      // 2. Получаем информацию об аккаунте
      console.log("\n🔍 ИНФОРМАЦИЯ ОБ АККАУНТЕ: ");
      try {
        const accountInfo = await this.restClient.getAccountInfo();
        if (isLog) {
          console.log("Account Info:", JSON.stringify(accountInfo, null, 2));
        }
      } catch (error) {
        console.log("Account Info недоступен:", error.message);
      }
      console.log("\n============= КОНЕЦ ПЕРСОНАЛЬНОЙ ИНФОРМАЦИИ =============");
    }
    console.log("days4: ", days);
    return days;
  }

  async getBalance(): Promise<Balance | null> {
    try {
      const balContract = await this.restClient.getWalletBalance({
        accountType: "CONTRACT"
      });
      const usdtContractInfo = balContract.result?.list?.[0].coin?.find((c) => c.coin === "USDT");
      if (usdtContractInfo) {
        return this.#formatBalance(usdtContractInfo, balContract.retMsg, "CONTRACT");
      } else {
        console.log("balContract: ", balContract);
      }
      const balUnified = await this.restClient.getWalletBalance({
        accountType: "UNIFIED"
      });
      const usdtUnifiedInfo = balUnified.result?.list?.[0].coin?.find((c) => c.coin === "USDT");
      if (usdtUnifiedInfo) {
        const res = this.#formatBalance(usdtUnifiedInfo, balContract.retMsg, usdtUnifiedInfo ? "UNIFIED" : "------");
        return res;
      } else {
        console.log("balUnified: ", balUnified);
        return null;
      }
    } catch (error) {
      console.error("Bybit GetBalance error: ", error);
      return null;
    }
  }

  async checkApiIsValid() {
    const balContract = await this.restClient.getWalletBalance({
      accountType: "CONTRACT"
    });
    console.info("balContract: ", balContract.retCode === 33004); //EXPIRED
    return true;
  }

  async getOpenPositions(pairs: string[] = []) {
    console.log("Bybit getOpenPositions: ");
    const openPositions = await this.restClient.getPositionInfo({
      category: "linear",
      settleCoin: "USDT"
    });
    const positionsList = openPositions?.result?.list || [];
    console.log("positionsList: ", positionsList);
    const positions = positionsList.map((p) => ({
      symbol: p.symbol,
      side: p.side === "Buy" ? Side.Long : Side.Short,
      size: p.positionValue,
      marginSize: 0,
      leverage: p.leverage || 0,
      unrealizedPL: p.unrealisedPnl,
      liquidationPrice: 0,
      markPrice: p.markPrice,
      openPriceAvg: p.avgPrice,
      marginType: "Unknown"
    }));

    const orders = await this.getOpenOrders(pairs);
    console.log("orders: ", orders.data.length);
    return { positions, openOrders: orders.data };
  }

  async closePosition(symbol: string, side: Side): Promise<{ status: boolean; message: string }> {
    console.log("closePosition Bybit: ", symbol, side);
    const positionToClose = await this.restClient.getPositionInfo({
      category: "linear",
      settleCoin: "USDT",
      symbol
    });
    const sideToClose = side === Side.Long ? "Buy" : side === Side.Short ? "Sell" : null;
    console.log("sideToClose: ", sideToClose);
    if (sideToClose == null) {
      return { status: false, message: "Invalid side" };
    }
    const position = positionToClose.result?.list.find((p) => p.side === sideToClose);
    console.log("positionToClose.result?.list: ", positionToClose.result?.list);
    console.log("position: ", position);
    if (position != null) {
      const closeSide = position.side === "Buy" ? "Sell" : "Buy";
      const positionIdx = position.positionIdx;
      const orderData: OrderParamsV5 = {
        category: "linear",
        symbol,
        side: closeSide,
        orderType: "Market",
        qty: position.size,
        positionIdx
      };
      console.log("orderData: ", orderData);
      const close = await this.restClient.submitOrder(orderData);
      console.log("close: ", close);
      return { status: true, message: `${close.retMsg}: orderId: ${close.result?.orderId}` };
    }
    return { status: false, message: "Position not found" };
  }

  async getOpenOrders(pairs: string[] = []): Promise<{ status: boolean; message: string; data: OpenOrder[] }> {
    console.log("getOpenOrders: ");
    try {
      const openOrders: AccountOrderV5[] = [];
      let nextPageCursor: string | undefined = undefined;
      do {
        try {
          const orders = await this.restClient.getActiveOrders({
            category: "linear",
            settleCoin: "USDT",
            limit: 50,
            cursor: nextPageCursor
          });
          nextPageCursor = orders?.result?.nextPageCursor || "";
          const ordersList = orders?.result?.list || [];
          openOrders.push(...ordersList);
        } catch (error) {
          nextPageCursor = "";
          console.error("Get pnl error: ", error);
        }
      } while (nextPageCursor !== "");
      console.log("openOrders: ", openOrders.length);
      return {
        status: true,
        message: "success",
        data:
          openOrders.map((o) => ({
            symbol: o.symbol,
            price: o.price,
            side: o.side === "Buy" ? Side.Long : Side.Short,
            amount: o.qty,
            leverage: o.isLeverage,
            orderId: String(o.orderId)
          })) || []
      };
    } catch (error) {
      console.log("error: ", error);
      return { status: false, message: error.message || "Some error", data: [] };
    }
  }
  async cancelOrder(symbol: string, orderId: string): Promise<{ status: boolean; message: string }> {
    console.log("cancelOrderBybit: ", symbol, orderId);
    try {
      const order = await this.restClient.cancelOrder({ category: "linear", orderId, symbol });
      return { status: true, message: order.retMsg };
    } catch (error) {
      console.log("error: ", error);
      return { status: false, message: error.message || "Some error" };
    }
  }

  async getIncomeHistory(
    incomeType: string,
    { start, to }: { start: number; to: number }
  ): Promise<IncomeHistoryRecord[]> {
    const result: IncomeHistoryRecord[] = [];
    let nextPageCursor: string | undefined = undefined;

    try {
      do {
        const pnlData = await this.restClient.getClosedPnL({
          category: "linear",
          startTime: start,
          endTime: to,
          limit: 100,
          cursor: nextPageCursor
        });

        nextPageCursor = pnlData?.result?.nextPageCursor || "";
        const pnlList = pnlData?.result?.list || [];

        for (const pnl of pnlList) {
          const executedAt = Number(pnl.updatedTime || 0);

          // Фильтруем только сделки, закрытые в указанном периоде
          if (executedAt < start || executedAt > to) {
            continue;
          }

          // Получаем историю ордеров для получения времени создания
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let orderDetails: any = null;
          try {
            const orderHistory = await this.restClient.getHistoricOrders({
              category: "linear",
              symbol: pnl.symbol,
              orderId: pnl.orderId,
              limit: 1
            });
            orderDetails = orderHistory?.result?.list?.[0];
          } catch (e) {
            console.warn("Failed to fetch order details for orderId", pnl.orderId);
          }

          result.push({
            orderId: pnl.orderId || "N/A",
            symbol: pnl.symbol || "N/A",
            createdAt: Number(orderDetails?.createdTime || pnl.createdTime || 0),
            executedAt,
            liquidationPrice: "0", // Bybit закрытые позиции не содержат цену ликвидации
            entryPrice: pnl.avgEntryPrice || "0",
            executionPrice: pnl.avgExitPrice || "0",
            quantity: pnl.qty || "0",
            income: pnl.closedPnl,
            asset: "USDT",
            incomeType: "REALIZED_PNL"
          });
        }
      } while (nextPageCursor !== "");
    } catch (error) {
      console.error("getIncomeHistory Bybit error: ", error);
    }

    return result;
  }

  #formatBalance(info: any, retMsg: string, type: string): Balance | null {
    if (!info) return null;
    const { walletBalance, unrealisedPnl } = info;
    return {
      total: walletBalance != null ? Number(walletBalance) : null,
      pnl: unrealisedPnl != null ? Number(unrealisedPnl) : null,
      retMsg,
      type,
      balanceResponse: info
    };
  }
}
