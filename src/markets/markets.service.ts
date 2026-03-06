import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import * as fs from "fs";
import * as path from "path";
import {
  ApiByApi,
  Balance,
  Market,
  ResponseInterface,
  TransferHistory,
  CheckCommissionsResponse,
  NikitaApiData,
  NikitaResponse
} from "./interfaces/index";
import { getDates } from "./helpers/getDates";
import { DbService, UserReport } from "src/db/db.service";
import { getClient } from "./helpers/getClient";
import { sendImportantMessageAsync, timeout } from "./helpers";
import { CancelOrder, DataResponse } from "./reports/interfaces";
import { ApiService } from "./api.service";
import { AccountPnlDocument } from "src/db/models/account-pnl.schema";
import { FullReport } from "./reports/fullReport.interface";
import { CommissionCheckService } from "src/commission-check/commission-check.service";
import axios from "axios";
import { Side } from "./helpers/exchange";
import * as XLSX from "xlsx";
import FormData = require("form-data");
import { nikitaResponse } from "src/shared/nikita_response";
const dayMs = 24 * 60 * 60 * 1000;

@Injectable()
export class MarketsService {
  apiServerUrl: string | null;
  backupServerUrl: string | null;
  salt: string | null;
  email: string | null;
  headers: { Authorization: string };

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly api: ApiService,
    private readonly db: DbService,
    private readonly commissionCheckService: CommissionCheckService
  ) {
    this.apiServerUrl = this.config.get("API_SERVER") || null;
    this.backupServerUrl = this.config.get("BACKUP_SERVER") || null;
    this.headers = {
      Authorization: `Bearer ${this.config.get<number>("BEARER")}`
    };
  }

  makeBackup() {
    console.info("makeBackup: ");
    const apiUrl = this.backupServerUrl + "/makeBackup";
    return this.http.get<ResponseInterface<{ status: boolean }>>(apiUrl);
  }

  async getPnlDaily(api: ApiByApi, start: number, to: number) {
    const client = getClient(api);
    return client.getPnl({
      start,
      to
    });
  }

  async checkBalance(apiId: string): Promise<DataResponse<Balance>> {
    const apis = await this.api.getApi();
    const api: ApiByApi | null = apis.find((a) => a.rev_id_orig === apiId) || null;
    if (api != null) {
      const client = getClient(api);
      const balance: Balance | null = await client.getBalance();
      console.log("balance: ", balance);
      if (balance != null) {
        return { status: true, data: balance };
      }
    }
    return { status: false, error: ["can't find api by api id " + apiId] };
  }

  async checkBalanceByEmail(email: string): Promise<DataResponse<Balance>> {
    const apis = await this.api.getApi();
    const api: ApiByApi | null = apis.find((a) => a.email === email) || null;
    if (api != null) {
      const client = getClient(api);
      const balance: Balance | null = await client.getBalance();
      if (balance != null) {
        return { status: true, data: balance };
      }
    }
    return { status: false, error: ["can't find api by email " + email] };
  }

  async updateBalanceNewApiAsync(secret: string) {
    const apis = await this.api.getApi();
    const api: ApiByApi | null = apis.find((a) => a.secret === secret) || null;
    if (api != null) {
      const { start, to } = getDates(1);
      const client = getClient(api);
      const history = await client.getTransferHistory(start, to);
      let balance: Balance | null = await client.getBalance(start, to);
      let counter = 0;
      while (balance == null && counter++ < 5) {
        const timeForWait = (counter + 1) * 1000;
        sendImportantMessageAsync(
          `@@We cant get balance in ${counter + 1} time, try again in ${timeForWait / 1000} seconds@@`
        );
        sendImportantMessageAsync(`updateBalanceNewApiAsync: email - ${api.email},key - ${api.key},name - ${api.name}`);
        balance = await client.getBalance(start, to);
        await timeout(timeForWait);
      }
      if (balance != null) {
        await this.db.saveApiInfo({
          start,
          history,
          balance,
          to,
          keyId: api.id,
          pnlDaily: null,
          notForTransferCount: true,
          snapshotTime: new Date().getTime(),
          username: api.email,
          market: api.market,
          keyName: api.name
        });
        console.info("updateBalanceNewApiAsync After save");
      }
      return { isTransferChecked: history.transfers != null, balance };
    }
  }

  async updateTransfersApiLast31Days(
    api: ApiByApi,
    username: string,
    getTransferHistory: (start: number, to: number) => Promise<TransferHistory>
  ) {
    const { start } = getDates(31);
    const histories = await this.db.getHistoriesToFillTransfers(api.id, start);

    for (const history of histories) {
      const { start: hisStart, to: hisTo } = history;
      const { transfers } = await getTransferHistory(hisStart, hisTo);
      if (transfers != null) {
        await this.db.updateHistory(history, transfers);

        const message = [
          `---------------Update transfers-----------`,
          `username - ${username}`,
          `name - ${api.name}`,
          `start report - ${new Date(hisStart)}`,
          `end report - ${new Date(hisTo)}`,
          `deposits - ${transfers.deposits.join(", ")}`,
          `withdrawals - ${transfers.withdrawals.join(", ")}`
        ];
        await sendImportantMessageAsync(message.join("\r\n"));
      }
    }
  }

  async makeProductionsReport({
    balance,
    api,
    username,
    pnlDaily,
    start,
    history,
    to
  }: {
    balance: Balance | null;
    api: ApiByApi;
    username: string;
    pnlDaily: number;
    start: number;
    to: number;
    history: TransferHistory;
  }) {
    if (balance == null) {
      const message = [`Can't get balance for api key: ${api.name}. Username - ${username}`];
      await sendImportantMessageAsync(message.join("\r\n"));
    }
    balance = { total: 0, pnl: 0 };
    const transfers = history.transfers;
    const avalBalance = (balance.total || 0) + (balance.pnl || 0);
    const bybitType = api.market === Market.Bybit ? balance.type : null;
    const message = [
      `--Pnl Reports--`,
      `username - ${username}`,
      `name - ${api.name}`,
      `market - ${api.market}`,
      `pnl current - ${balance.pnl?.toFixed(2)}`,
      `pnl for 24 hour - ${pnlDaily?.toFixed(2)}`,
      `${bybitType != null ? "account type - " + bybitType : ""}`,
      `aval balance - ${avalBalance?.toFixed(2)}`,
      `total balance - ${balance.total?.toFixed(2)}`,
      `deposits - ${transfers != null ? transfers.deposits.join(", ") : "No data"}`,
      `withdrawals - ${transfers != null ? transfers.withdrawals.join(", ") : "No data"}`,
      balance.retMsg ? `Статус запроса баланса - ${balance.retMsg}` : ""
    ];
    await this.db.savePnlInfo({
      start,
      balance,
      to,
      keyId: api.id,
      pnlDaily,
      snapshotTime: new Date().getTime(),
      username,
      market: api.market,
      keyName: api.name,
      email: api.email
    });
    // await this.db.updatePnlInfo({
    //   start,
    //   to,
    //   keyId: api.id,
    //   pnlDaily,
    //   snapshotTime: new Date().getTime()
    // });
    console.info("makeProductionsReport After save");
    await sendImportantMessageAsync(message.join("\r\n"));
  }

  async updateReports(start: number, apis: ApiByApi[], usernames: any[]) {
    const to = start + dayMs;
    //   .filter(
    //   (a) => a.name === "aca"
    //   // || a.name === "MA147" || a.name === "arthembot_key1"
    // )
    for (const api of apis) {
      const username = usernames.find((u) => u.email === api.email)?.username || api.email;
      const client = getClient(api);
      const pnlDaily = await client.getPnl({ start, to });
      const pnlOldReport = await this.db.getApiPnlReport(start, to, api.id);
      const commonOldReport = await this.db.getApiReport(start, to, api.id);
      const timedPnl = commonOldReport[0]?.pnl;
      const total = commonOldReport[0]?.totalBalance;
      const snapshotTime = commonOldReport[0]?.snapshotTime || new Date().getTime();
      if (pnlOldReport.length === 0) {
        const savePnlInfo = {
          start,
          balance: {
            total,
            pnl: timedPnl
          },
          to,
          keyId: api.id,
          pnlDaily: pnlDaily || 0,
          snapshotTime,
          username,
          market: api.market,
          keyName: api.name,
          email: api.email
        };
        await this.db.savePnlInfo(savePnlInfo);
        await sendImportantMessageAsync(
          [
            "+++++Create Old Api report+++++",
            `${username} - ${api.name}`,
            `Date ${new Date(start).toLocaleDateString()} -  ${new Date(to).toLocaleDateString()}`,
            `Pnl: ${timedPnl?.toFixed(2)}, pnlDaily: ${pnlDaily?.toFixed(2)}`
          ].join("\r\n")
        );
      } else {
        const updatePnlInfo = { start, to, keyId: api.id, pnlDaily: pnlDaily || 0, snapshotTime };
        await this.db.updatePnlInfo(updatePnlInfo);
        await sendImportantMessageAsync(
          [
            "^^^^^Update Old Api report^^^^^",
            `${username} - ${api.name}`,
            `Date ${new Date(start).toLocaleDateString()} -  ${new Date(to).toLocaleDateString()}`,
            `PnlDaily: ${pnlDaily?.toFixed(2)}`
          ].join("\r\n")
        );
      }
    }
    await sendImportantMessageAsync(
      [
        "REPORT BY DATE MADE",
        `Date ${new Date(start).toLocaleDateString()} -  ${new Date(to).toLocaleDateString()}`
      ].join("\r\n")
    );
  }

  async getPairs() {
    const apiUrl = this.apiServerUrl + "/api/getAllTradePairs";
    return this.http.get<ResponseInterface<string[]>>(apiUrl, {
      headers: this.headers
    });
  }

  async getPairsData() {
    const val = (await firstValueFrom(await this.getPairs()))?.data;
    return val?.status ? val.data || [] : [];
  }

  async update30daysPnl() {
    const apis = await this.api.getApi();
    let { start } = getDates(31);
    const now = new Date().getTime();
    const usernames = (await this.db.getUsernames())?.data || [];
    do {
      await this.updateReports(start, apis, usernames);
      start += dayMs;
    } while (start < now - dayMs);
    await sendImportantMessageAsync(["FINISH ALL REPORTS"].join("\r\n"));
  }

  async checkApiDataByPnl(isProduction: boolean) {
    const apis = await this.api.getApi();
    const { start, to } = getDates(1);
    const usernames = (await this.db.getUsernames())?.data || [];
    const pairs: string[] = await this.getPairsData();
    for (const api of apis) {
      const username = usernames.find((u) => u.email === api.email)?.username || api.email;
      const client = getClient(api);
      if (client == null) {
        await sendImportantMessageAsync(`Can't get client for api key: ${api.name}. Username - ${username}`);
        continue;
      }
      const balance: Balance | null = (await client?.getBalance()) || null;
      const pnlDaily = await client.getPnl({
        start,
        to,
        pairs
      });
      const history = await client.getTransferHistory(start, to);
      if (pnlDaily == null) {
        await sendImportantMessageAsync(`Can't get pnl daily for ${api.name} / ${username}`);
        continue;
      }
      if (isProduction) {
        await this.makeProductionsReport({
          balance,
          api,
          username,
          pnlDaily,
          start,
          to,
          history
        });
        if (balance == null) {
          const message = [`Can't get balance by pnl for api key: ${api.name}. Username - ${username}`];
          await sendImportantMessageAsync(message.join("\r\n"));
        }
      }
    }
    console.info("Finish");
    if (isProduction) {
      await sendImportantMessageAsync("All api checked by pnl");
    }
  }

  async getIncomeHistory(userEmail: string, apiName: string, start: number, to: number) {
    console.log("userEmail: ", userEmail);
    console.log("apiName: ", apiName);
    const apis = await this.api.getApi();
    console.log("apis: ", apis.length);
    const api = apis.find((a) => a.name === apiName && a.email === userEmail);
    console.log("api: ", api);
    if (api == null) {
      return { status: false, error: "Api not found" };
    }
    const client = getClient(api);
    const incomeHistory = await client.getIncomeHistory("REALIZED_PNL", { start, to });
    return {
      status: true,
      data: incomeHistory.filter((h) => h.incomeType === "REALIZED_PNL")
    };
  }

  async getIncomeAndTrades(userEmail: string, apiName: string, start: number, to: number) {
    const apis = await this.api.getApi();
    const api = apis.find((a) => a.name === apiName && a.email === userEmail);
    if (api == null) {
      return { status: false, error: "Api not found", income: [], trades: [] };
    }
    const client = getClient(api);
    const incomeHistory = await client.getIncomeHistory("REALIZED_PNL", { start, to });
    let trades: any[] = [];
    if (api.market === Market.Binance && typeof (client as any).getTrades === "function") {
      trades = await (client as any).getTrades({ start, to });
    }
    return {
      status: true,
      income: incomeHistory.filter((h) => h.incomeType === "REALIZED_PNL"),
      trades
    };
  }

  async checkUserPnl(userEmail: string, apiName: string, start: number, to: number) {
    console.log("start: ", new Date(start).toLocaleDateString());
    console.log("to: ", new Date(to).toLocaleDateString());
    let delta = to - start;
    const day = 1000 * 60 * 60 * 24;
    const stepDays = 1;
    const deltaTime = stepDays * day;
    let counter = 0;

    const apis = await this.api.getApi();
    const api = apis.find((a) => a.name === apiName && a.email === userEmail);
    console.log("api: ", api);
    if (api == null) {
      return { status: false, error: "Api not found" };
    }

    const pairs: string[] = await this.getPairsData();
    const client = getClient(api);
    let pnlDailySum = 0;
    const pnls: any[] = [];
    do {
      const startRes = start + deltaTime * counter;
      const toRes = startRes + deltaTime;
      console.log("startRes: ", new Date(startRes).toLocaleDateString(), " - ", new Date(toRes).toLocaleDateString());
      delta -= deltaTime;
      counter++;
      if (api == null) {
        return { status: false, error: "Api not found" };
      }
      const pnl = await client.getPnl({
        start: startRes,
        to: toRes,
        pairs
      });
      console.log("pnlDaily: ", pnl);
      pnlDailySum += pnl || 0;
      pnls.push({
        start: new Date(startRes).toLocaleDateString(),
        to: new Date(toRes).toLocaleDateString(),
        pnl
      });
      // const history = await client.getTransferHistory(start, to);
      // console.log('history: ', history);
    } while (delta > 0);

    return { pnlDaily: pnlDailySum, pnls };
  }

  async checkUserPnlByEmail(userEmail: string, start: number, to: number) {
    console.log(`Проверка PnL для пользователя: ${userEmail}`);
    console.log("start: ", new Date(start).toLocaleDateString());
    console.log("to: ", new Date(to).toLocaleDateString());

    const apis = await this.api.getApi();
    const usernameMap = await this.db.getUserNameMap();
    const userApis = apis.filter((a) => a.email === userEmail);

    if (userApis.length === 0) {
      return { status: false, error: "Пользователь с таким email не найден" };
    }

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];
    const results: any[] = [];

    // Создаем базовую директорию для отчетов
    const reportsBaseDir = path.join(process.cwd(), "pnl_reports");
    if (!fs.existsSync(reportsBaseDir)) {
      fs.mkdirSync(reportsBaseDir, { recursive: true });
    }

    console.log(`Начинаем проверку ${userApis.length} ключей для пользователя ${userEmail}...`);

    let currentIndex = 0;
    for (const api of userApis) {
      currentIndex++;
      try {
        const username = usernameMap.get(api.email) || api.email;
        console.log(`[${currentIndex}/${userApis.length}] Обработка ключа: ${api.name} (${username})`);

        // Получаем клиент
        const client = getClient(api);
        if (!client) {
          console.error(
            `✗ [${currentIndex}/${userApis.length}] Не удалось создать клиент для ${api.name} (${api.market})`
          );
          errorCount++;
          errors.push(`${api.name} (${api.email}): Failed to create client for market ${api.market}`);
          continue;
        }

        // Получаем income history
        const incomeHistory = await client.getIncomeHistory("REALIZED_PNL", { start, to });

        // Фильтруем только REALIZED_PNL
        const filteredIncome = incomeHistory.filter((h) => h.incomeType === "REALIZED_PNL");

        // Фильтруем только сделки с отрицательным доходом (убытки)
        const negativeIncomeDeals = filteredIncome.filter((h) => Number(h.income) < 0);

        // Если нет сделок с убытками, все равно добавляем в результат
        if (negativeIncomeDeals.length === 0) {
          console.log(`⊘ [${currentIndex}/${userApis.length}] Нет сделок с убытками для ${api.name} (${username})`);
          results.push({
            apiName: api.name,
            market: api.market,
            username,
            dealsCount: 0,
            deals: []
          });
          successCount++;
          continue;
        }

        // Подготавливаем данные для JSON
        const dealsData = negativeIncomeDeals.map((h) => ({
          orderId: h.orderId,
          symbol: h.symbol,
          createdAt: h.createdAt ? new Date(h.createdAt).toISOString() : "",
          executedAt: h.executedAt ? new Date(h.executedAt).toISOString() : "",
          entryPrice: h.entryPrice,
          executionPrice: h.executionPrice,
          quantity: h.quantity,
          liquidationPrice: h.liquidationPrice,
          income: h.income,
          asset: h.asset,
          incomeType: h.incomeType
        }));

        results.push({
          apiName: api.name,
          market: api.market,
          username,
          dealsCount: negativeIncomeDeals.length,
          deals: dealsData
        });

        console.log(
          `✓ [${currentIndex}/${userApis.length}] Обработан ключ: ${api.name} (${negativeIncomeDeals.length} сделок с убытками)`
        );
        successCount++;
      } catch (error) {
        console.error(`✗ [${currentIndex}/${userApis.length}] Ошибка при обработке ключа ${api.name}:`, error);
        errorCount++;
        errors.push(`${api.name} (${api.email}): ${error.message}`);
      }
    }

    const username = usernameMap.get(userEmail) || userEmail;
    const reportData = {
      userEmail,
      username,
      period: {
        start: new Date(start).toISOString(),
        end: new Date(to).toISOString(),
        startDate: new Date(start).toLocaleDateString(),
        endDate: new Date(to).toLocaleDateString()
      },
      summary: {
        totalApis: userApis.length,
        successCount,
        errorCount,
        totalDeals: results.reduce((sum, r) => sum + r.dealsCount, 0)
      },
      apis: results,
      errors,
      generatedAt: new Date().toISOString()
    };

    // Сохраняем в JSON файл
    const fileName = `pnl_report_${username.replace(/[^a-zA-Z0-9]/g, "_")}_${start}_${to}.json`;
    const filePath = path.join(reportsBaseDir, fileName);

    fs.writeFileSync(filePath, JSON.stringify(reportData, null, 2), "utf8");
    console.log(`Отчет сохранен в файл: ${filePath}`);

    return {
      status: true,
      message: `Проверка PnL для пользователя ${userEmail} завершена`,
      fileName,
      filePath,
      summary: reportData.summary,
      data: reportData
    };
  }

  async checkUserCommissions(userEmail: string, startDate: number, endDate: number): Promise<CheckCommissionsResponse> {
    return await this.commissionCheckService.checkUserCommissions(userEmail, startDate, endDate);
  }

  async checkApiData(isProduction: boolean) {
    const apis = await this.api.getApi();
    const { start, to } = getDates(1);
    const usernames = (await this.db.getUsernames())?.data || [];
    for (const api of apis) {
      const username = usernames.find((u) => u.email === api.email)?.username || api.email;
      const client = getClient(api);
      if (client == null) {
        await sendImportantMessageAsync(`Can't get client for api key: ${api.name}. Username - ${username}`);
        continue;
      }
      const { start: hisStart, to: hisTo } = await this.db.getHistoryRequestTime(api.id, start, to);
      const history = await client.getTransferHistory(hisStart, hisTo);
      let balance: Balance | null = await client.getBalance();
      const pnlDaily = await client.getPnl({
        transfers: history,
        balance,
        start,
        to
      });
      if (isProduction) {
        if (balance == null) {
          const message = [`Can't get balance for api key: ${api.name}. Username - ${username}`];
          await sendImportantMessageAsync(message.join("\r\n"));
        }
        balance = { total: 0, pnl: 0 };
        const transfers = history.transfers;
        if (isProduction) {
          await this.db.saveApiInfo({
            start,
            history,
            balance,
            to,
            keyId: api.id,
            pnlDaily,
            snapshotTime: new Date().getTime(),
            username,
            market: api.market,
            keyName: api.name
          });
        }
        console.info("checkApiData After save");

        if (transfers != null && api.market === Market.Bybit) {
          await this.updateTransfersApiLast31Days(api, username, (start, to) => client.getTransferHistory(start, to));
        }
      }
    }
    console.info("Finish");
    await sendImportantMessageAsync("All api checked by transfers (New format)");
  }

  async updateStatuses() {
    const apis = await this.api.getApi();
    const { start, to } = getDates(1);
    for (const api of apis) {
      const client = getClient(api);
      const history = await client.getTransferHistory(start, to);
      if (history.transfers == null) {
        await this.db.updateApiTransferStatus(api.email, api.id, false);
      } else {
        await this.db.updateApiTransferStatus(api.email, api.id, true);
      }
    }
    console.info("Finish updateStatuses");
    await sendImportantMessageAsync("All api checked for statuses");
  }

  async getAllReports(from: string, to: string): Promise<FullReport[]> {
    const reports: FullReport[] = [];
    console.time("getAllReports");
    const [usernames, apis, allApiPnlReports, allApiReports] = await Promise.all([
      this.db.getUsernames(),
      this.db.getUsersForReports(),
      this.db.getAllApiPnlReports(Number(from), Number(to)),
      this.db.getAllApiReports(Number(from), Number(to))
    ]);
    console.timeEnd("getAllReports");
    console.time("getAllReports2");

    // Предварительная группировка данных для O(1) доступа
    const usernamesMap = new Map();
    usernames.data.forEach((u: any) => {
      usernamesMap.set(u.email, { username: u.username || u.email, tgAccount: u.tgAccount || "" });
    });

    const pnlReportsByKeyId = new Map();
    allApiPnlReports.forEach((report: any) => {
      const keyId = report.keyId;
      if (!pnlReportsByKeyId.has(keyId)) {
        pnlReportsByKeyId.set(keyId, []);
      }
      pnlReportsByKeyId.get(keyId).push(report);
    });

    const apiReportsByKeyIdAndTo = new Map();
    allApiReports.forEach((report: any) => {
      const keyId = report.keyId;
      const to = report.to;
      const key = `${keyId}_${to}`;
      apiReportsByKeyIdAndTo.set(key, report);
    });

    // Параллельная обработка данных только для больших объемов
    const batchSize = 50; // Размер батча для параллельной обработки
    const useParallelProcessing = apis.length > 100; // Используем параллельную обработку только для больших объемов

    if (useParallelProcessing) {
      const apiBatches: UserReport[][] = [];
      for (let i = 0; i < apis.length; i += batchSize) {
        apiBatches.push(apis.slice(i, i + batchSize));
      }

      const batchResults = await Promise.all(
        apiBatches.map(async (apiBatch) => {
          const batchReports: FullReport[] = [];

          for (const api of apiBatch) {
            const keyId = api._id?.valueOf() || null;
            const email: string = api.email;
            const { username = email, tgAccount = "" } = usernamesMap.get(email) || { username: email, tgAccount: "" };

            const apiReports: AccountPnlDocument[] = pnlReportsByKeyId.get(keyId) || [];

            batchReports.push(
              ...apiReports.map((r) => {
                const nonPnlDbInfo = apiReportsByKeyIdAndTo.get(`${keyId}_${r.to}`);
                return {
                  ...r,
                  apiName: api.name,
                  username,
                  tgAccount,
                  transfers: nonPnlDbInfo?.transfers,
                  totalBalance: r?.totalBalance,
                  api: {
                    rev_id: api.rev_id,
                    key: api.key,
                    botIds: api.botIds,
                    market: api.market,
                    email,
                    isTransferHistoryAvailable: api.isTransferHistoryAvailable
                  }
                };
              })
            );
          }

          return batchReports;
        })
      );

      // Объединяем результаты всех батчей
      reports.push(...batchResults.flat());
    } else {
      // Последовательная обработка для небольших объемов
      for (const api of apis) {
        const keyId = api._id?.valueOf() || null;
        const email: string = api.email;
        const { username = email, tgAccount = "" } = usernamesMap.get(email) || { username: email, tgAccount: "" };

        const apiReports: AccountPnlDocument[] = pnlReportsByKeyId.get(keyId) || [];

        reports.push(
          ...apiReports.map((r) => {
            const nonPnlDbInfo = apiReportsByKeyIdAndTo.get(`${keyId}_${r.to}`);
            return {
              ...r,
              apiName: api.name,
              username,
              tgAccount,
              transfers: nonPnlDbInfo?.transfers,
              totalBalance: r?.totalBalance,
              api: {
                rev_id: api.rev_id,
                key: api.key,
                botIds: api.botIds,
                market: api.market,
                email,
                isTransferHistoryAvailable: api.isTransferHistoryAvailable
              }
            };
          })
        );
      }
    }

    console.timeEnd("getAllReports2");
    return reports;
  }

  async getPnlUsernames(): Promise<{ username: string }[]> {
    const reports: { username: string }[] = [];
    const [usernames, apis] = await Promise.all([this.db.getUserNameMap(), this.db.getUsersForReports()]);
    for (const api of apis) {
      const email: string = api.email;
      const username = usernames.get(email) || email;
      reports.push({ username });
    }
    return reports;
  }

  async getUsernameReports(from: string, to: string, email: string): Promise<FullReport[]> {
    const reports: FullReport[] = [];
    const [usernames, apis, allApiPnlReports, allApiReports] = await Promise.all([
      this.db.getUserNameMap(),
      this.db.getUsersForReportsByEmail(email),
      this.db.getAllApiPnlReportsByEmail(Number(from), Number(to), email),
      this.db.getAllApiReports(Number(from), Number(to))
    ]);

    // Предварительная группировка данных для O(1) доступа
    const pnlReportsByKeyId = new Map();
    allApiPnlReports.forEach((report: any) => {
      const keyId = report.keyId;
      if (!pnlReportsByKeyId.has(keyId)) {
        pnlReportsByKeyId.set(keyId, []);
      }
      pnlReportsByKeyId.get(keyId).push(report);
    });

    const apiReportsByKeyIdAndTo = new Map();
    allApiReports.forEach((report: any) => {
      const keyId = report.keyId;
      const to = report.to;
      const key = `${keyId}_${to}`;
      apiReportsByKeyIdAndTo.set(key, report);
    });

    for (const api of apis) {
      const keyId = api._id?.valueOf() || null;
      const email: string = api.email;
      const username = usernames.get(email) || email;
      const apiReports: AccountPnlDocument[] = pnlReportsByKeyId.get(keyId) || [];

      reports.push(
        ...apiReports.map((r) => {
          const nonPnlDbInfo = apiReportsByKeyIdAndTo.get(`${keyId}_${r.to}`);
          return {
            ...r,
            apiName: api.name,
            username,
            tgAccount: "",
            transfers: nonPnlDbInfo?.transfers,
            totalBalance: r?.totalBalance,
            api: {
              rev_id: api.rev_id,
              key: api.key,
              botIds: api.botIds,
              market: api.market,
              email,
              isTransferHistoryAvailable: api.isTransferHistoryAvailable
            }
          };
        })
      );
    }
    return reports;
  }

  async getAllReportsWithUsersDatesBasedByReports(
    from: string,
    to: string,
    oldestDate: number,
    usersDates: { email: string; start: number }[]
  ): Promise<FullReport[]> {
    const reports: FullReport[] = [];
    const [usernames, apis, allApiPnlReports, allApiReports] = await Promise.all([
      this.db.getUsernames(),
      this.db.getUsersForReports(),
      this.db.getAllApiPnlReports(Number(oldestDate), Number(to)),
      this.db.getAllApiLastReports(Number(to))
    ]);

    // Предварительная группировка данных для O(1) доступа
    const usernamesMap = new Map();
    usernames.data.forEach((u: any) => {
      usernamesMap.set(u.email, { username: u.username || u.email, tgAccount: u.tgAccount || "" });
    });

    const usersDatesMap = new Map();
    usersDates.forEach((u) => {
      usersDatesMap.set(u.email, u.start);
    });

    const apisByEmailAndName = new Map();
    apis.forEach((api) => {
      const key = `${api.email}_${api.name}`;
      apisByEmailAndName.set(key, api);
    });

    const apiReportsByKeyId = new Map();
    allApiReports.forEach((report: any) => {
      const keyId = report.keyId;
      apiReportsByKeyId.set(keyId, report);
    });

    const reportsByEmail = allApiPnlReports.reduce((acc, report) => {
      const { email, keyName } = report;
      if (!acc[email]) {
        acc[email] = {};
      }
      if (!acc[email][keyName]) {
        acc[email][keyName] = [];
      }
      acc[email][keyName].push(report);
      return acc;
    }, {});

    for (const email in reportsByEmail) {
      const userReports = reportsByEmail[email];
      const userStartDate = usersDatesMap.get(email) || Number(from);

      for (const keyName in userReports) {
        const userKeyReports = userReports[keyName];
        const matchingApi = apisByEmailAndName.get(`${email}_${keyName}`);

        userKeyReports.forEach((report) => {
          if (report.start >= userStartDate) {
            const nonPnlDbInfo = apiReportsByKeyId.get(report.keyId);
            const { tgAccount = "" } = usernamesMap.get(email) || { tgAccount: "" };

            const fullReport: FullReport = {
              ...report,
              apiName: keyName,
              username: email,
              tgAccount,
              transfers: nonPnlDbInfo?.transfers,
              totalBalance: nonPnlDbInfo?.totalBalance,
              api: {
                rev_id: matchingApi?.rev_id || null,
                key: matchingApi?.key || null,
                botIds: matchingApi?.botIds || [],
                market: report.market,
                email: email,
                isTransferHistoryAvailable: matchingApi?.isTransferHistoryAvailable || false
              }
            };

            reports.push(fullReport);
          }
        });
      }
    }

    return reports;
  }

  async checkApisIsValid(isProduction: boolean) {
    const apis = await this.api.getApi();
    // const usernames = (await this.db.getUsernames())?.data || [];
    for (const api of [apis.filter((a) => a.market === "Bitget")[0], apis.filter((a) => a.market === "Bitget")[1]]) {
      // for (const api of apis.filter((a) => a.market === "Binance")) {
      // const username = usernames.find((u) => u.email === api.email)?.username || api.email;
      const client = getClient(api);
      try {
        const balance: boolean = await client.checkApiIsValid();
      } catch (error) {
        console.error("checkApisIsValid error: ", error);
      }
    }
  }

  async updatePnlHistoriesToEmail() {
    await this.db.updatePnlHistoriesToEmail();
  }

  async updateOldPnlHistoriesToApiData() {
    const users = await this.db.getUsersForReports();
    const fiftyDaysAgo = Date.now() - 50 * 24 * 60 * 60 * 1000;
    const pnlHistories = await this.db.getAllApiPnlReports(fiftyDaysAgo, Date.now());
    const historiesWithoutUsername = pnlHistories.filter((h) => !h.email);
    const usernameMap = await this.db.getUserNameMap();
    let isUpdated = 0;
    for (const history of historiesWithoutUsername) {
      if (historiesWithoutUsername.indexOf(history) % 50 === 0) {
        console.log("history: ", historiesWithoutUsername.indexOf(history));
      }
      const userInfo = users.find((u) => {
        return u._id.toString() === history.keyId;
      });
      const username = usernameMap.get(userInfo?.email || "");
      if (userInfo) {
        isUpdated++;
        await this.db.updatePnlHistory({
          start: history.start,
          keyId: history.keyId,
          email: userInfo?.email || "",
          username: username || "",
          keyName: userInfo?.name || ""
        });
      }
    }
    console.log("isUpdated: ", isUpdated);
  }

  async sendTestMessage() {
    await sendImportantMessageAsync("Test message");
  }

  async getOpenPositionByApi(revId: string) {
    const api = await this.api.getApiById(revId);
    console.log("api: ", api);
    if (api == null) {
      return { status: false, error: "Api not found" };
    }
    const client = getClient(api);
    const pairs: string[] = await this.getPairsData();
    const openPositions = await client.getOpenPositions?.(pairs);
    return { status: true, data: openPositions };
  }

  async closePosition(apiRevId: string, symbol: string, positionSide: Side, amount: string) {
    const api = await this.api.getApiById(apiRevId);
    console.log("api: ", api);
    if (api == null) {
      return { status: false, error: "Api not found" };
    }
    const client = getClient(api);
    const closePosition = await client.closePosition(symbol, positionSide, amount);
    return closePosition;
  }

  async cancelOrder(apiRevId: string, symbol: string, orderId: string) {
    console.log("cancelOrder received orderId:", orderId, "type:", typeof orderId);
    const api = await this.api.getApiById(apiRevId);
    if (api == null) {
      return { status: false, error: "Api not found" };
    }
    const client = getClient(api);
    const cancelOrder = await client.cancelOrder(symbol, orderId);
    return cancelOrder;
  }

  async cancelAllOrders(apiRevId: string, orders: CancelOrder[]) {
    console.log("cancelAllOrders: ", apiRevId, orders);
    const api = await this.api.getApiById(apiRevId);
    if (api == null) {
      return { status: false, error: "Api not found" };
    }
    const client = getClient(api);
    const response: {
      status: boolean;
      message: string;
    }[] = [];
    for (const order of orders) {
      const cancelOrder = await client.cancelOrder(order.symbol, order.orderId);
      response.push(cancelOrder);
    }
    const status: boolean = response.every((order) => order.status);
    const text = [...new Set(response.map((order) => order.message).filter(Boolean))].join(", ");
    return {
      status,
      text
    };
  }

  async sendKeyReminderMessage(
    keys: {
      apiName: string;
      email: string;
      age: number;
    }[]
  ) {
    console.log("keys: ", keys);
    const emailArray = keys
      .filter((k) => k.age === 15 || k.age === 3)
      .map((k) => {
        return { email: k.email, apiName: k.apiName, age: k.age };
      });
    console.log("emailArray: ", emailArray);
    const apiUrl = this.apiServerUrl + "/api/sendKeyReminderMessage";
    console.log("apiUrl: ", apiUrl);
    await axios.post(apiUrl, { emailArray }).then((r) => r.data);
  }

  async checkBybitKeys() {
    const apis = await this.api.getApi();
    const bybitApis = apis.filter((a) => a.market === Market.Bybit);
    const bybitKeys = bybitApis
      .map((a) => {
        return {
          apiName: a.name,
          // key: a.key,
          email: a.email,
          age: Math.floor((new Date(a.expirationDate || Date.now()).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        };
      })
      .sort((a, b) => b.age - a.age)
      .filter((a) => a.age <= 15 && a.age > 0);
    const usernameMap = await this.db.getUserNameMap();
    const keys = bybitKeys
      .map((a) => {
        const username = usernameMap.get(a.email) || a.email;
        return `${username} - ${a.apiName} - ${a.age} days`;
      })
      .join("\n");

    await this.sendKeyReminderMessage(bybitKeys);

    await sendImportantMessageAsync(`
Ключи у которых заканчивается срок в 90 дней:
${bybitKeys.length > 0 ? keys : "Нет ключей"}`);
    return bybitKeys;
  }

  async checkBinancePnlAndSend(start: number, to: number) {
    const apis = await this.api.getApi();
    const binanceApis = apis.filter((a) => a.market === Market.Binance);
    const usernameMap = await this.db.getUserNameMap();

    let successCount = 0;
    let errorCount = 0;
    let sentCount = 0;
    const errors: string[] = [];
    const apiServerUrl = this.config.get("API_SERVER");

    console.log(`Начинаем проверку ${binanceApis.length} Binance ключей...`);

    let currentIndex = 0;
    for (const api of binanceApis) {
      console.log("api : ", api);
      currentIndex++;
      try {
        const username = usernameMap.get(api.email) || api.email;
        console.log(`[${currentIndex}/${binanceApis.length}] Обработка Binance ключа: ${api.name} (${username})`);

        // Получаем клиент
        const client = getClient(api);
        if (!client) {
          console.error(`✗ [${currentIndex}/${binanceApis.length}] Не удалось создать клиент для ${api.name}`);
          errorCount++;
          errors.push(`${api.name} (${api.email}): Failed to create client`);
          continue;
        }

        // Получаем income history
        const incomeHistory = await client.getIncomeHistory("REALIZED_PNL", { start, to });

        // Фильтруем только REALIZED_PNL
        const filteredIncome = incomeHistory.filter((h) => h.incomeType === "REALIZED_PNL");

        // Если нет сделок, пропускаем
        if (filteredIncome.length === 0) {
          console.log(`⊘ [${currentIndex}/${binanceApis.length}] Нет сделок для ${api.name} (${username})`);
          successCount++;
          continue;
        }

        // Подготавливаем данные для Excel
        const incomeData = [
          [
            "orderId",
            "symbol",
            "createdAt",
            "executedAt",
            "entryPrice",
            "executionPrice",
            "quantity",
            "liquidationPrice",
            "income",
            "asset",
            "incomeType"
          ],
          ...filteredIncome.map((h) => [
            h.orderId,
            h.symbol,
            h.createdAt ? new Date(h.createdAt).toISOString() : "",
            h.executedAt ? new Date(h.executedAt).toISOString() : "",
            h.entryPrice,
            h.executionPrice,
            h.quantity,
            h.liquidationPrice,
            h.income,
            h.asset,
            h.incomeType
          ])
        ];

        // Создаем workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(incomeData);
        XLSX.utils.book_append_sheet(wb, ws, "Income Realized PnL");

        // Генерируем буфер файла (не сохраняем на диск)
        const fileBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

        // Отправляем файл на сервер
        try {
          const formData = new FormData();
          formData.append("file", fileBuffer, {
            filename: `${username}+${api.name}.xlsx`,
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          });
          formData.append("email", api.email);
          formData.append("apiName", api.name);

          const uploadUrl = `${apiServerUrl}/reports/send-xlsx`;
          await axios.post(uploadUrl, formData, {
            headers: {
              ...formData.getHeaders()
            }
          });

          sentCount++;
          console.log(
            `✓ [${currentIndex}/${binanceApis.length}] Отправлен отчет для ${api.name}: ${filteredIncome.length} сделок`
          );
        } catch (uploadError) {
          console.error(
            `✗ [${currentIndex}/${binanceApis.length}] Ошибка отправки файла для ${api.name}:`,
            uploadError?.message
          );
          errors.push(`${api.name} (${api.email}): Upload failed - ${uploadError?.message}`);
          errorCount++;
          continue;
        }

        successCount++;
      } catch (error) {
        console.error(`✗ [${currentIndex}/${binanceApis.length}] Ошибка при обработке ключа ${api.name}:`, error);
        errorCount++;
        errors.push(`${api.name} (${api.email}): ${error.message}`);
      }
    }

    console.log(`\nЗавершено! Успешно: ${successCount}, Отправлено: ${sentCount}, Ошибок: ${errorCount}`);

    return {
      totalKeys: binanceApis.length,
      successCount,
      sentCount,
      errorCount,
      errors
    };
  }

  async checkBybitPnlAndSend(start: number, to: number) {
    const apis = await this.api.getApi();
    const bybitApis = apis.filter((a) => a.market === Market.Bybit);
    const usernameMap = await this.db.getUserNameMap();

    let successCount = 0;
    let errorCount = 0;
    let sentCount = 0;
    const errors: string[] = [];
    const apiServerUrl = this.config.get("API_SERVER");

    console.log(` Начинаем проверку ${bybitApis.length} Bybit ключей...`);

    let currentIndex = 0;
    for (const api of bybitApis) {
      console.log("api : ", api);
      currentIndex++;
      try {
        const username = usernameMap.get(api.email) || api.email;
        console.log(`[${currentIndex}/${bybitApis.length}] Обработка Bybit ключа: ${api.name} (${username})`);

        // Получаем клиент
        const client = getClient(api);
        if (!client) {
          console.error(`✗ [${currentIndex}/${bybitApis.length}] Не удалось создать клиент для ${api.name}`);
          errorCount++;
          errors.push(`${api.name} (${api.email}): Failed to create client`);
          continue;
        }

        // Получаем income history
        const incomeHistory = await client.getIncomeHistory("REALIZED_PNL", { start, to });

        // Фильтруем только REALIZED_PNL
        const filteredIncome = incomeHistory.filter((h) => h.incomeType === "REALIZED_PNL");

        // Если нет сделок, пропускаем
        if (filteredIncome.length === 0) {
          console.log(`⊘ [${currentIndex}/${bybitApis.length}] Нет сделок для ${api.name} (${username})`);
          successCount++;
          continue;
        }

        // Подготавливаем данные для Excel
        const incomeData = [
          [
            "orderId",
            "symbol",
            "createdAt",
            "executedAt",
            "entryPrice",
            "executionPrice",
            "quantity",
            "liquidationPrice",
            "income",
            "asset",
            "incomeType"
          ],
          ...filteredIncome.map((h) => [
            h.orderId,
            h.symbol,
            h.createdAt ? new Date(h.createdAt).toISOString() : "",
            h.executedAt ? new Date(h.executedAt).toISOString() : "",
            h.entryPrice,
            h.executionPrice,
            h.quantity,
            h.liquidationPrice,
            h.income,
            h.asset,
            h.incomeType
          ])
        ];

        // Создаем workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(incomeData);
        XLSX.utils.book_append_sheet(wb, ws, "Income Realized PnL");

        // Генерируем буфер файла (не сохраняем на диск)
        const fileBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

        // Отправляем файл на сервер
        try {
          const formData = new FormData();
          formData.append("file", fileBuffer, {
            filename: `${username}+${api.name}.xlsx`,
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          });
          formData.append("email", api.email);
          formData.append("apiName", api.name);

          const uploadUrl = `${apiServerUrl}/reports/send-xlsx`;
          await axios.post(uploadUrl, formData, {
            headers: {
              ...formData.getHeaders()
            }
          });

          sentCount++;
          console.log(
            `✓ [${currentIndex}/${bybitApis.length}] Отправлен отчет для ${api.name}: ${filteredIncome.length} сделок`
          );
        } catch (uploadError) {
          console.error(
            `✗ [${currentIndex}/${bybitApis.length}] Ошибка отправки файла для ${api.name}:`,
            uploadError?.message
          );
          errors.push(`${api.name} (${api.email}): Upload failed - ${uploadError?.message}`);
          errorCount++;
        }

        // Отправляем PDF файл отдельным сообщением (всегда, независимо от результата XLSX)
        try {
          const pdfPath = path.join(process.cwd(), "pretenziya-bybit-template.pdf");
          console.log("pdfPath: ", pdfPath);
          console.log("fs.existsSync(pdfPath): ", fs.existsSync(pdfPath));
          if (fs.existsSync(pdfPath)) {
            const pdfFormData = new FormData();
            const pdfBuffer = fs.readFileSync(pdfPath);
            pdfFormData.append("file", pdfBuffer, {
              filename: "pretenziya-bybit-template.pdf",
              contentType: "application/pdf"
            });
            pdfFormData.append("email", api.email);
            pdfFormData.append("apiName", api.name);

            const pdfUploadUrl = `${apiServerUrl}/reports/send-pdf`;
            await axios.post(pdfUploadUrl, pdfFormData, {
              headers: {
                ...pdfFormData.getHeaders()
              }
            });

            console.log(`✓ [${currentIndex}/${bybitApis.length}] Отправлен PDF файл для ${api.name}`);
          } else {
            console.warn(`⚠ [${currentIndex}/${bybitApis.length}] PDF файл не найден: ${pdfPath}`);
          }
        } catch (pdfError) {
          console.error(
            `✗ [${currentIndex}/${bybitApis.length}] Ошибка отправки PDF для ${api.name}:`,
            pdfError?.message
          );
          errors.push(`${api.name} (${api.email}): PDF upload failed - ${pdfError?.message}`);
        }

        successCount++;
      } catch (error) {
        console.error(`✗ [${currentIndex}/${bybitApis.length}] Ошибка при обработке ключа ${api.name}:`, error);
        errorCount++;
        errors.push(`${api.name} (${api.email}): ${error.message}`);
      }
    }

    console.log(`\nЗавершено! Успешно: ${successCount}, Отправлено: ${sentCount}, Ошибок: ${errorCount}`);

    return {
      totalKeys: bybitApis.length,
      successCount,
      sentCount,
      errorCount,
      errors
    };
  }

  async checkBitgetPnlAndSend(start: number, to: number) {
    const apis = await this.api.getApi();
    const bitgetApis = apis.filter((a) => a.market === Market.Bitget);
    const usernameMap = await this.db.getUserNameMap();

    let successCount = 0;
    let errorCount = 0;
    let sentCount = 0;
    const errors: string[] = [];
    const apiServerUrl = this.config.get("API_SERVER");

    console.log(` Начинаем проверку ${bitgetApis.length} Bitget ключей...`);

    let currentIndex = 0;
    for (const api of bitgetApis) {
      currentIndex++;
      try {
        const username = usernameMap.get(api.email) || api.email;
        console.log(`[${currentIndex}/${bitgetApis.length}] Обработка Bitget ключа: ${api.name} (${username})`);

        const client = getClient(api);
        if (!client) {
          console.error(`✗ [${currentIndex}/${bitgetApis.length}] Не удалось создать клиент для ${api.name}`);
          errorCount++;
          errors.push(`${api.name} (${api.email}): Failed to create client`);
          continue;
        }

        // Для Bitget: отправляем только PDF всем пользователям, без проверки сделок и XLSX
        try {
          const pdfPath = path.join(process.cwd(), "pretenziya-bitget-template.pdf");
          console.log("pdfPath: ", pdfPath);
          console.log("fs.existsSync(pdfPath): ", fs.existsSync(pdfPath));
          if (fs.existsSync(pdfPath)) {
            const pdfFormData = new FormData();
            const pdfBuffer = fs.readFileSync(pdfPath);
            pdfFormData.append("file", pdfBuffer, {
              filename: "pretenziya-bitget-template.pdf",
              contentType: "application/pdf"
            });
            pdfFormData.append("email", api.email);
            pdfFormData.append("apiName", api.name);

            const pdfUploadUrl = `${apiServerUrl}/reports/send-pdf`;
            await axios.post(pdfUploadUrl, pdfFormData, {
              headers: {
                ...pdfFormData.getHeaders()
              }
            });

            console.log(`✓ [${currentIndex}/${bitgetApis.length}] Отправлен PDF файл для ${api.name}`);
            sentCount++;
          } else {
            console.warn(`⚠ [${currentIndex}/${bitgetApis.length}] PDF файл не найден: ${pdfPath}`);
          }
        } catch (pdfError) {
          console.error(
            `✗ [${currentIndex}/${bitgetApis.length}] Ошибка отправки PDF для ${api.name}:`,
            (pdfError as any)?.message
          );
          errors.push(`${api.name} (${api.email}): PDF upload failed - ${(pdfError as any)?.message}`);
          errorCount++;
        }

        successCount++;
      } catch (error) {
        console.error(`✗ [${currentIndex}/${bitgetApis.length}] Ошибка при обработке ключа ${api.name}:`, error);
        errorCount++;
        errors.push(`${api.name} (${api.email}): ${(error as any).message}`);
      }
    }

    console.log(`\nЗавершено! Успешно: ${successCount}, Отправлено: ${sentCount}, Ошибок: ${errorCount}`);

    return {
      totalKeys: bitgetApis.length,
      successCount,
      sentCount,
      errorCount,
      errors
    };
  }

  async checkAllUsersPnl(start: number, to: number) {
    const bitgetApis = (await this.api.getApi()).filter((a) => a.market === Market.Bitget);
    const usernameMap = await this.db.getUserNameMap();

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Создаем базовую директорию для отчетов
    const reportsBaseDir = path.join(process.cwd(), "pnl_reports");
    if (!fs.existsSync(reportsBaseDir)) {
      fs.mkdirSync(reportsBaseDir, { recursive: true });
    }

    console.log(`Начинаем  проверку ${bitgetApis.length} ключей...`);

    let currentIndex = 0;
    for (const api of bitgetApis) {
      currentIndex++;
      try {
        const username = usernameMap.get(api.email) || api.email;
        console.log(`[${currentIndex}/${bitgetApis.length}] Обработка ключа : ${api.name} (${username})`);

        // Получаем клиент
        const client = getClient(api);
        if (!client) {
          console.error(
            `✗ [${currentIndex}/${bitgetApis.length}] Не удалось создать клиент для ${api.name} (${api.market})`
          );
          errorCount++;
          errors.push(`${api.name} (${api.email}): Failed to create client for market ${api.market}`);
          continue;
        }

        // Получаем income history
        const incomeHistory = await client.getIncomeHistory("REALIZED_PNL", { start, to });

        // Фильтруем только REALIZED_PNL
        const filteredIncome = incomeHistory.filter((h) => h.incomeType === "REALIZED_PNL");

        // Если нет сделок, пропускаем создание файла
        if (filteredIncome.length === 0) {
          console.log(`⊘ [${currentIndex}/${bitgetApis.length}] Нет сделок для ${api.name} (${username})`);
          successCount++;
          continue;
        }

        // Создаем директорию для пользователя только если есть сделки
        const userDir = path.join(reportsBaseDir, username);
        if (!fs.existsSync(userDir)) {
          fs.mkdirSync(userDir, { recursive: true });
        }

        // Подготавливаем данные для Excel
        const incomeData = [
          [
            "orderId",
            "symbol",
            "createdAt",
            "executedAt",
            "entryPrice",
            "executionPrice",
            "quantity",
            "liquidationPrice",
            "income",
            "asset",
            "incomeType"
          ],
          ...filteredIncome.map((h) => [
            h.orderId,
            h.symbol,
            h.createdAt ? new Date(h.createdAt).toISOString() : "",
            h.executedAt ? new Date(h.executedAt).toISOString() : "",
            h.entryPrice,
            h.executionPrice,
            h.quantity,
            h.liquidationPrice,
            h.income,
            h.asset,
            h.incomeType
          ])
        ];

        // Создаем workbook
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(incomeData);
        XLSX.utils.book_append_sheet(wb, ws, "Income Realized PnL");

        // Сохраняем файл
        const fileName = `${username}+${api.name}.xlsx`;
        const filePath = path.join(userDir, fileName);
        XLSX.writeFile(wb, filePath);

        console.log(
          `✓ [${currentIndex}/${bitgetApis.length}] Сохранен отчет: ${filePath} (${filteredIncome.length} сделок)`
        );
        successCount++;
      } catch (error) {
        console.error(`✗ [${currentIndex}/${bitgetApis.length}] Ошибка при обработке ключа ${api.name}:`, error);
        errorCount++;
        errors.push(`${api.name} (${api.email}): ${error.message}`);
      }
    }

    console.log(`\nЗавершено! Успешно: ${successCount}, Ошибок: ${errorCount}`);

    // Удаляем пустые папки пользователей
    try {
      const userDirs = fs.readdirSync(reportsBaseDir);
      let removedDirs = 0;
      for (const dir of userDirs) {
        const dirPath = path.join(reportsBaseDir, dir);
        const stat = fs.statSync(dirPath);
        if (stat.isDirectory()) {
          const files = fs.readdirSync(dirPath);
          if (files.length === 0) {
            fs.rmdirSync(dirPath);
            removedDirs++;
            console.log(`Удалена пустая папка: ${dir}`);
          }
        }
      }
      if (removedDirs > 0) {
        console.log(`Удалено пустых папок: ${removedDirs}`);
      }
    } catch (error) {
      console.warn("Ошибка при удалении пустых папок:", error.message);
    }

    return {
      totalKeys: bitgetApis.length,
      successCount,
      errorCount,
      errors
    };
  }

  async getNikitaData(): Promise<NikitaResponse> {
    return {
      status: true,
      data: nikitaResponse as NikitaApiData[]
    };

    //   const start = 1760043600000;
    //   const to = 1760216400000;
    //   const targetEmail = "31474625@tg.login";

    //   try {
    //     // Получаем все API ключи для указанного email
    //     const apis = await this.api.getApi();
    //     const nikitaApis = apis.filter((api) => api.email === targetEmail && api.market === Market.Bybit);

    //     if (nikitaApis.length === 0) {
    //       return {
    //         status: false,
    //         error: `Не найдено API ключей Bybit для email: ${targetEmail}`
    //       };
    //     }

    //     const results: NikitaApiData[] = [];

    //     for (const api of nikitaApis) {
    //       try {
    //         const client = getClient(api);
    //         if (!client) {
    //           console.error(`Не удалось создать клиент для API ключа: ${api.name}`);
    //           continue;
    //         }

    //         // Получаем income history для расчета ликвидированной суммы
    //         const incomeHistory = await client.getIncomeHistory("REALIZED_PNL", { start, to });
    //         const filteredIncome = incomeHistory.filter((h) => h.incomeType === "REALIZED_PNL");

    //         // Берем только те ключи у которых income меньше нуля
    //         const negativeIncome = filteredIncome.filter((h) => Number(h.income) < 0);

    //         if (negativeIncome.length === 0) {
    //           console.log(`Нет отрицательных income для API ключа: ${api.name}`);
    //           continue;
    //         }

    //         // Суммируем все отрицательные income
    //         const liquidatedAmount = negativeIncome.reduce((sum, h) => sum + Math.abs(Number(h.income)), 0);

    //         // Получаем api_uid от Bybit
    //         let apiUid = "";
    //         try {
    //           if (api.market === Market.Bybit) {
    //             const apiKeyInfo = await (client as any).restClient.getQueryApiKey();
    //             apiUid = apiKeyInfo?.result?.userID || "";
    //           }
    //         } catch (error) {
    //           console.error(`Ошибка получения api_uid для ${api.name}:`, error);
    //         }

    //         results.push({
    //           api_id: api.rev_id_orig,
    //           api_name: api.name,
    //           api_key: api.key,
    //           api_uid: apiUid,
    //           liquidated_amount: liquidatedAmount
    //         });
    //       } catch (error) {
    //         console.error(`Ошибка обработки API ключа ${api.name}:`, error);
    //       }
    //     }

    //     return {
    //       status: true,
    //       data: results
    //     };
    //   } catch (error) {
    //     console.error("Ошибка в getNikitaData:", error);
    //     return {
    //       status: false,
    //       error: error.message
    //     };
    //   }
  }
}
