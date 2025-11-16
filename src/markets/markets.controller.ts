import { Controller, Get, Post, Body, Param, Res } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { MarketsService } from "./markets.service";
import { ReportsService } from "src/reports/reports.service";
import { getDates } from "./helpers/getDates";
import { envToBoolean, getLastMonthLength } from "./helpers";
import { firstValueFrom } from "rxjs";
import { DbService } from "src/db/db.service";
import { ConfigService } from "@nestjs/config";
import { CancelOrder } from "./reports/interfaces";
import {
  CheckCommissionsRequest,
  CheckCommissionsResponse,
  GetUserReportRequest,
  ClosePositionRequest,
  CancelOrderRequest
} from "./interfaces/index";
import { Response } from "express";
import * as zlib from "zlib";
import axios from "axios";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import { CommissionCalculationRequest, WalletReport } from "src/reports/interfaces/index";
import { toCents } from "./reports/helpers";
import { ApiService } from "./api.service";
import { Response as ExpressResponse } from "express";
@Controller("markets")
export class MarketsController {
  isProduction: boolean;
  constructor(
    private readonly marketsService: MarketsService,
    private readonly reportsService: ReportsService,
    private readonly configService: ConfigService,
    private readonly db: DbService,
    private readonly api: ApiService
  ) {
    this.isProduction = envToBoolean(this.configService.get("IS_PRODUCTION"));
    console.log("this.isProduction : ", this.isProduction);
  }

  @Get("/check")
  async check() {
    return this.isProduction;
  }

  @Post("/getReports")
  async getReports(@Body() period: { from: number; to: number }) {
    const { from, to } = period;
    return this.db.getReports(from, to);
  }

  @Get("/getUserReportsCsv")
  async getUserReportsCsv() {
    return this.db.getUserReportsCsv();
  }

  @Post("/getPnlReports")
  async getPnlReports(@Body() period: { from: number; to: number }) {
    const { from, to } = period;
    return this.db.getPnlReports(from, to);
  }

  @Post("/getPnlReportsByEmail")
  async getPnlReportsByEmail(@Body() period: { from: number; to: number; email: string }) {
    console.log("getPnlReportsByEmail: ", period);
    const { from, to, email } = period;
    const res = await this.db.getPnlReportsByEmail(from, to, email);
    console.log("res: ", res);
    return {
      status: true,
      data: res
    };
  }

  // @Cron("01 0 * * *")
  @Get("/checkApiData")
  async checkApiData() {
    await this.marketsService.checkApiData(this.isProduction);
  }

  // @Cron("01 0 * * *")
  @Get("/checkApiDataByPnl")
  async checkApiDataByPnl() {
    await this.marketsService.checkApiDataByPnl(this.isProduction);
  }

  // @Cron(CronExpression.EVERY_HOUR)
  @Get("/checkApisIsValid")
  async checkApisIsValid() {
    await this.marketsService.checkApisIsValid(this.isProduction);
  }

  @Get("/checkBalance/:apiId")
  async checkBalance(@Param("apiId") revApiId: string) {
    return await this.marketsService.checkBalance(revApiId);
  }

  @Get("/checkBalanceByEmail")
  async checkBalanceByEmail() {
    return await this.marketsService.checkBalanceByEmail("252435077@tg.login");
  }

  @Get("/update30daysPnl")
  async update30daysPnl() {
    return await this.marketsService.update30daysPnl();
  }

  @Get("/updateBalanceNewApiAsync/:key")
  async updateBalanceNewApiAsync(@Param("key") key: string) {
    return await this.marketsService.updateBalanceNewApiAsync(key);
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  @Get("/makeBackup")
  async makeBackup() {
    await firstValueFrom(this.marketsService.makeBackup());
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  @Get("/compareBalances")
  async compareBalances() {
    await this.reportsService.compareBalances();
  }

  // At 7:00 AM, only on Monday
  @Cron("0 7 * * 1")
  @Get("/weekly")
  async makeWeeklyReports() {
    const { start, to } = getDates(7);
    const res = await this.reportsService.makeReport(start, to, "weekly");

    // Отправляем запрос на расчет комиссий партнеров
    await this.sendCommissionCalculationRequest(res, start, to);

    return res;
  }

  // At 7:00 AM, on day 1 of the month
  @Cron("0 7 1 * *")
  @Get("/monthly")
  async makeMonthlyReports() {
    const { start, to } = getDates(getLastMonthLength());
    const res = await this.reportsService.makeReport(start, to, "monthly");

    // Отправляем запрос на расчет комиссий партнеров
    await this.sendCommissionCalculationRequest(res, start, to);

    return res;
  }

  @Get("/monthly-check-dry-run")
  async monthlyCheck() {
    const { start, to } = getDates(getLastMonthLength());
    console.log("start: ", new Date(start).toLocaleDateString());
    console.log("to: ", new Date(to).toLocaleDateString());
    const res = await this.reportsService.makeReportDryRun(start, to, "monthly");
    // console.log("res: ", res);
    const totalCommissions = res.reduce((sum, report) => {
      console.log("report: ", report);
      console.log("report.totalCommission: ", report.totalCommission);
      return sum + (report.totalCommission || 0);
    }, 0);
    const totalBalances = res.reduce((sum, report) => {
      console.log("report: ", report);
      console.log("report.endBalance: ", report.endBalance);
      return sum + (report.endBalance || 0);
    }, 0);
    console.log("totalCommissions: ", totalCommissions);
    console.log("totalBalances: ", totalBalances);
    return res;
  }

  @Get("/getUserTrades3m")
  async getUserTrades3m(@Res() res: Response) {
    const userEmail = "6668976834@tg.login";
    const apiName = "belvic";
    const to = Date.now();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 3);
    const start = startDate.getTime();

    const { income, trades, status, error } = await this.marketsService.getIncomeAndTrades(
      userEmail,
      apiName,
      start,
      to
    );
    if (!status) {
      return res.status(404).json({ status: false, error });
    }

    // Prepare Excel workbook with two sheets
    const incomeData = [
      ["time", "symbol", "incomeType", "asset", "income", "info"],
      ...income.map((h) => [
        h.time ? new Date(h.time).toISOString() : "",
        h.symbol,
        h.incomeType,
        h.asset,
        h.income,
        h.info
      ])
    ];

    const tradesData = [
      ["time", "symbol", "id", "orderId", "side", "price", "qty", "quoteQty", "realizedPnl", "positionSide"],
      ...trades.map((t) => [
        t.time ?? t.T ? new Date(t.time ?? t.T).toISOString() : "",
        t.symbol ?? t.s ?? "",
        t.id ?? t.a ?? "",
        t.orderId ?? t.i ?? "",
        t.side ?? t.S ?? "",
        t.price ?? t.p ?? "",
        t.qty ?? t.q ?? "",
        t.quoteQty ?? t.V ?? "",
        t.realizedPnl ?? t.rp ?? "",
        t.positionSide ?? t.ps ?? ""
      ])
    ];

    // Create workbook with two sheets
    const wb = XLSX.utils.book_new();
    const wsIncome = XLSX.utils.aoa_to_sheet(incomeData);
    const wsTrades = XLSX.utils.aoa_to_sheet(tradesData);

    XLSX.utils.book_append_sheet(wb, wsIncome, "Income Realized PnL");
    XLSX.utils.book_append_sheet(wb, wsTrades, "Trades");

    // Generate Excel file buffer
    const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="trades_and_income_${new Date(start).toISOString()}_${new Date(to).toISOString()}.xlsx"`
    );
    res.end(excelBuffer);
  }

  @Get("/weekly-check-dry-run")
  async weeklyCheck() {
    const { start, to } = getDates(getLastMonthLength());
    console.log("start: ", new Date(start).toLocaleDateString());
    console.log("to: ", new Date(to).toLocaleDateString());
    const res = await this.reportsService.makeReportDryRun(start, to, "weekly");
    // console.log("res: ", res);
    const totalCommissions = res.reduce((sum, report) => {
      // console.log("report: ", report);
      // console.log("report.totalCommission: ", report.totalCommission);
      return sum + (report.totalCommission || 0);
    }, 0);
    const totalBalances = res.reduce((sum, report) => {
      // console.log("report: ", report);
      // console.log("report.endBalance: ", report.endBalance);
      return sum + (report.endBalance || 0);
    }, 0);
    console.log("totalCommissions: ", totalCommissions);
    console.log("totalBalances: ", totalBalances);
    return res;
  }

  @Get("/reports-test")
  async makeReportsTest() {
    // const { start, to } = getDates(getLastMonthLength());
    const start1 = 1748217600000; //C 26 мая
    const to1 = 1748822400000; //C 2 июня
    const start2 = 1748822400000; //C 2 июня
    const to2 = 1749427200000; //C 9 июня
    // МЕСЯЦ
    const start3 = 1746057600000; //C 1 мая
    const to3 = 1748736000000; //C 1 июня
    let res = await this.reportsService.makeReport(start1, to1, "weekly");
    console.log("res: ", res);
    res = await this.reportsService.makeReport(start2, to2, "weekly");
    console.log("res: ", res);
    res = await this.reportsService.makeReport(start3, to3, "monthly");
    console.log("res: ", res);
    return res;
  }

  @Get("/updateStatuses")
  async updateStatuses() {
    await this.marketsService.updateStatuses();
  }

  @Get("/getAllReports/:from/:to")
  async getAllReports(@Param("from") from: string, @Param("to") to: string, @Res() res: Response) {
    const reports = await this.marketsService.getAllReports(from, to);
    const responseData = {
      status: true,
      data: reports
    };

    const jsonData = JSON.stringify(responseData);

    // Проверяем, поддерживает ли клиент gzip сжатие
    const acceptEncoding = res.req.headers["accept-encoding"] || "";

    if (acceptEncoding.includes("gzip")) {
      // Сжимаем данные с помощью gzip
      const compressed = zlib.gzipSync(jsonData);

      res.set({
        "Content-Encoding": "gzip",
        "Content-Type": "application/json",
        "Content-Length": compressed.length.toString()
      });

      res.send(compressed);
    } else {
      // Отправляем без сжатия
      res.json(responseData);
    }
  }

  @Get("/getPnlUsernames")
  async getPnlUsernames() {
    const reports = await this.marketsService.getPnlUsernames();
    return {
      status: true,
      data: reports
    };
  }

  @Get("/getUsernameReports/:from/:to/:email")
  async getUsernameReports(@Param("from") from: string, @Param("to") to: string, @Param("email") email: string) {
    const reports = await this.marketsService.getUsernameReports(from, to, email);
    return {
      status: true,
      data: reports
    };
  }

  @Get("/updatePnlHistoriesToEmail")
  async updatePnlHistoriesToEmail() {
    return await this.marketsService.updatePnlHistoriesToEmail();
  }

  @Get("/updateOldPnlHistoriesToApiData")
  async updateOldPnlHistoriesToApiData() {
    return await this.marketsService.updateOldPnlHistoriesToApiData();
  }

  @Get("/sendTestMessage")
  async sendTestMessage() {
    return await this.marketsService.sendTestMessage();
  }

  @Post("/getOpenPositionByApi/:revId")
  async getOpenPositionByApi(@Param("revId") revId: string) {
    return await this.marketsService.getOpenPositionByApi(revId);
  }

  @Post("/closePosition")
  async closePosition(@Body() data: ClosePositionRequest) {
    return await this.marketsService.closePosition(
      data.apiRevId,
      data.symbol,
      data.positionSide,
      String(data.positionAmt)
    );
  }

  @Post("/cancelOrder")
  async cancelOrder(@Body() data: CancelOrderRequest) {
    return await this.marketsService.cancelOrder(data.apiRevId, data.symbol, data.orderId);
  }

  @Post("/cancelAllOrders")
  async cancelAllOrders(
    @Body()
    data: {
      apiRevId: string;
      orders: CancelOrder[];
    }
  ) {
    return await this.marketsService.cancelAllOrders(data.apiRevId, data.orders);
  }

  @Get("/updateOldReports")
  async updatePnlReportBalance() {
    return await this.reportsService.updateOldReports();
  }

  @Get("/checkUserPnl")
  async checkUserPnl(@Res() res: Response) {
    const start = 1760043600000;
    const to = 1760216400000;

    const result = await this.marketsService.checkAllUsersPnl(start, to);

    return res.json({
      status: true,
      message: `Проверено ${result.totalKeys} ключей, успешно: ${result.successCount}, ошибок: ${result.errorCount}`,
      errors: result.errors
    });
  }

  @Post("/checkUserPnlByEmail")
  async checkUserPnlByEmail(@Res() res: Response) {
    const email = "31474625@tg.login"; // захардкоженный email
    const start = 1760043600000;
    const to = 1760216400000;

    const result = await this.marketsService.checkUserPnlByEmail(email, start, to);

    if (!result.status) {
      return res.status(404).json(result);
    }

    return res.json({
      status: true,
      message: `Проверка PnL для пользователя ${email} завершена. Обработано API ключей: ${
        result.summary?.totalApis || 0
      }, успешно: ${result.summary?.successCount || 0}, ошибок: ${
        result.summary?.errorCount || 0
      }, всего убыточных сделок: ${result.summary?.totalDeals || 0}`,
      fileName: result.fileName,
      summary: result.summary
    });
  }

  @Get("/getUserPnlReport/:fileName")
  async getUserPnlReport(@Param("fileName") fileName: string, @Res() res: Response) {
    try {
      const filePath = path.join(process.cwd(), "pnl_reports", fileName);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({
          status: false,
          error: "Файл отчета не найден"
        });
      }

      const fileContent = fs.readFileSync(filePath, "utf8");
      const reportData = JSON.parse(fileContent);

      return res.json({
        status: true,
        data: reportData
      });
    } catch (error) {
      return res.status(500).json({
        status: false,
        error: "Ошибка при чтении файла отчета"
      });
    }
  }

  @Get("/checkBinancePnl")
  async checkBinancePnl(@Res() res: Response) {
    const start = 1760043600000;
    const to = 1760216400000;

    const result = await this.marketsService.checkBinancePnlAndSend(start, to);

    return res.json({
      status: true,
      message: `Проверено ${result.totalKeys} ключей Binance, успешно: ${result.successCount}, отправлено: ${result.sentCount}, ошибок: ${result.errorCount}`,
      errors: result.errors
    });
  }

  @Get("/checkBybitPnl")
  async checkBybitPnl(@Res() res: Response) {
    const start = 1760043600000;
    const to = 1760216400000;

    const result = await this.marketsService.checkBybitPnlAndSend(start, to);

    return res.json({
      status: true,
      message: `Проверено ${result.totalKeys} ключей Bybit, успешно: ${result.successCount}, отправлено: ${result.sentCount}, ошибок: ${result.errorCount}`,
      errors: result.errors
    });
  }

  @Get("/checkBitgetPnl")
  async checkBitgetPnl(@Res() res: Response) {
    const start = 1760043600000;
    const to = 1760216400000;

    const result = await this.marketsService.checkBitgetPnlAndSend(start, to);

    return res.json({
      status: true,
      message: `Проверено ${result.totalKeys} ключей Bitget, успешно: ${result.successCount}, отправлено: ${result.sentCount}, ошибок: ${result.errorCount}`,
      errors: result.errors
    });
  }

  @Get("/export-10-11")
  async exportBalances1011(@Res() res: Response) {
    const TO_10 = 1760054400000;
    const TO_11 = 1760140800000;

    // Получаем все ключи и карту username/email
    const [apis, usernameMap, pnlData] = await Promise.all([
      this.api.getApi(),
      this.db.getUserNameMap(),
      this.db.getApiPnlReportsByToValues([TO_10, TO_11])
    ]);

    // Карта: keyId -> { email, keyName }
    const keyInfoMap = new Map<string, { email: string; keyName: string }>();
    apis.forEach((a: any) => {
      keyInfoMap.set(a.id, { email: a.email, keyName: a.name });
    });

    // Группируем по keyId и to
    const byKeyAndTo = new Map<string, any>();
    pnlData.forEach((r: any) => {
      const key = `${r.keyId}_${r.to}`;
      byKeyAndTo.set(key, r);
    });

    // Собираем строки и данные для итогов по пользователю
    const rows: any[][] = [["username", "keyName", "totalBalance_10", "totalBalance_11"]];
    const userTotals = new Map<string, { bal10: number; bal11: number }>();

    for (const api of apis) {
      const keyId = api.id;
      const info = keyInfoMap.get(keyId);
      if (!info) continue;

      const email = info.email;
      const username = usernameMap.get(email) || email;
      const keyName = info.keyName;

      const r10 = byKeyAndTo.get(`${keyId}_${TO_10}`);
      const r11 = byKeyAndTo.get(`${keyId}_${TO_11}`);

      const bal10 = r10?.totalBalance ?? 0;
      const bal11 = r11?.totalBalance ?? 0;

      rows.push([username, keyName, bal10, bal11]);

      const totals = userTotals.get(username) || { bal10: 0, bal11: 0 };
      totals.bal10 += bal10;
      totals.bal11 += bal11;
      userTotals.set(username, totals);
    }

    // Добавляем строки "Итого" по каждому пользователю
    rows.push([]);
    rows.push(["Итого по пользователям", "", "", ""]);
    for (const [username, totals] of userTotals.entries()) {
      rows.push([username, "Итого", totals.bal10, totals.bal11]);
    }

    // Формируем Excel
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Balances 10-11");

    const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="balances_10_11.xlsx"`);
    res.end(excelBuffer);
  }

  // @Get("/getNikitaData")
  // async getNikitaData() {
  //   return await this.marketsService.getNikitaData();
  // }

  /**
   * НЕ изменяет данные в БД и НЕ отправляет сообщения
   * Выводит детальную информацию о расчетах в консоль
   */
  @Post("/checkUserCommissions")
  async checkUserCommissions(@Body() data: CheckCommissionsRequest): Promise<CheckCommissionsResponse> {
    const { email, startDate, endDate } = data;
    return await this.marketsService.checkUserCommissions(email, startDate, endDate);
  }

  @Post("/getUserReport")
  async getUserReport(@Body() data: GetUserReportRequest) {
    console.log("getUserReport: ", data);
    const { email, from, to, isStartModify = true } = data;
    const report = await this.reportsService.makeUserReport(from, to, email, isStartModify);
    console.log("report: ", report);

    if (!report) {
      return {
        status: false,
        message: "Отчет для пользователя не найден или отсутствуют данные за указанный период",
        data: null
      };
    }

    return {
      status: true,
      message: "Отчет успешно сгенерирован",
      data: report
    };
  }

  // @Cron(CronExpression.EVERY_DAY_AT_8AM)
  @Get("/checkBybitKeys")
  async checkBybitKeys() {
    return await this.marketsService.checkBybitKeys();
  }

  /**
   * Отправляет запрос на расчет комиссий партнеров
   */
  private async sendCommissionCalculationRequest(reports: WalletReport[], from: number, to: number): Promise<void> {
    try {
      const ownerEmail = process.env.OWNER_EMAIL;
      if (!ownerEmail) {
        console.warn("OWNER_EMAIL не установлен в переменных окружения");
        return;
      }

      // Вычисляем общие суммы
      const totalCommissions = reports.reduce((sum, report) => {
        console.log("report: ", report);
        console.log("report.totalCommission: ", report.totalCommission);
        return sum + (report.totalCommission || 0);
      }, 0);
      const totalBalances = reports.reduce((sum, report) => {
        console.log("report: ", report);
        console.log("report.endBalance: ", report.endBalance);
        return sum + (report.endBalance || 0);
      }, 0);
      console.log("totalCommissions: ", totalCommissions);
      console.log("totalBalances: ", totalBalances);

      const requestData: CommissionCalculationRequest = {
        email: ownerEmail,
        totalCommissions: toCents(totalCommissions),
        totalBalances: toCents(totalBalances),
        from,
        to
      };

      // Отправляем запрос на сервер
      const response = await axios.post(`${process.env.API_SERVER}/admin/partners/commission-calculation`, requestData);

      console.log("Запрос на расчет комиссий партнеров отправлен успешно:", {
        email: ownerEmail,
        totalCommissions,
        totalBalances,
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString()
      });
    } catch (error) {
      console.error("Ошибка при отправке запроса на расчет комиссий партнеров:", error);
    }
  }
}
