import { Controller, Get, Query, Delete } from "@nestjs/common";
import { CheckerService } from "./checker.service";
import { getDates } from "src/markets/helpers/getDates";
import { getLastMonthLength } from "src/markets/helpers";
import { Cron, CronExpression } from "@nestjs/schedule";

@Controller("checker")
export class CheckerController {
  constructor(private readonly checkerService: CheckerService) {}

  // @Get("/checkTransferHistory")
  // async checkTransferHistory() {
  //   const email = "113925618@tg.login";
  //   const { start, to } = getDates(2, 1);
  //   return await this.checkerService.checkTransferHistory(email, start, to);
  // }

  @Get("/checkApiDataByPnl")
  async checkApiDataByPnl() {
    const email = "484660368@tg.login";
    const { start, to } = getDates(1);
    await this.checkerService.checkApiInfoByPnl(email, start, to);
  }

  @Get("/userInfo")
  async userInfo() {
    const email = "647719417@tg.login";
    const apiName = "vaximus2021 - Bybit Futures 3k";
    // const { start, to } = getDates(1);
    await this.checkerService.getUserInfo(email, apiName);
  }

  @Get("/referrals-pnl-history")
  async getReferralsPnlHistory(
    @Query("email") email: string,
    @Query("start") start?: string,
    @Query("to") to?: string,
    @Query("days") days?: string
  ) {
    if (!email) {
      throw new Error("Email параметр обязателен");
    }

    let startTimestamp: number;
    let toTimestamp: number;

    if (start && to) {
      // Используем переданные timestamp'ы
      startTimestamp = parseInt(start);
      toTimestamp = parseInt(to);
    } else if (days) {
      // Используем количество дней назад
      const { start: calcStart, to: calcTo } = getDates(parseInt(days));
      startTimestamp = calcStart;
      toTimestamp = calcTo;
    } else {
      // По умолчанию - последние 7 дней
      const { start: calcStart, to: calcTo } = getDates(7);
      startTimestamp = calcStart;
      toTimestamp = calcTo;
    }

    console.log("toTimestamp: ", toTimestamp);
    console.log("startTimestamp: ", startTimestamp);
    return await this.checkerService.getReferralsPnlHistory(email, startTimestamp, toTimestamp);
  }

  @Get("/problematic-transactions")
  async getProblematicTransactions() {
    return await this.checkerService.getProblematicTransactions();
  }

  @Cron(CronExpression.EVERY_DAY_AT_11AM)
  @Get("/update-bybit-expiration-dates")
  async updateBybitApiExpirationDates() {
    return await this.checkerService.updateBybitApiExpirationDates();
  }

  // @Get("/weekly")
  // async makeWeeklyReports() {
  //   const { start, to } = getDates(7);
  //   const res = await this.checkerService.makeReportWithDates(start, to, "weekly");
  //   return res;
  // }

  // @Get("/weekly-dates")
  // async makeWeeklyReportsDates() {
  //   const { start, to } = getDates(getLastMonthLength());
  //   const res = await this.checkerService.makeReportWithDates(start, to, "weekly");
  //   return res;
  // }

  // // At 7:00 AM, on day 1 of the month
  // @Get("/monthly")
  // async makeMonthlyReports() {
  //   const { start, to } = getDates(getLastMonthLength());
  //   const res = await this.checkerService.makeReportWithDates(start, to, "monthly");
  //   return res;
  // }

  @Get("/user-results-by-creation-date")
  async getUserResultsByCreationDate(@Query("afterDate") afterDate?: string) {
    // Используем дату по умолчанию, если не передана
    const targetDate = afterDate ? new Date(afterDate) : new Date("2025-06-09T15:00:00.000Z");

    if (isNaN(targetDate.getTime())) {
      throw new Error("Неверный формат даты. Используйте ISO формат, например: 2025-06-09T15:00:00.000Z");
    }

    return await this.checkerService.getUserResultsByCreationDate(targetDate);
  }

  @Delete("/user-results-by-creation-date")
  async deleteUserResultsByCreationDate(@Query("afterDate") afterDate?: string) {
    // Используем дату по умолчанию, если не передана
    const targetDate = afterDate ? new Date(afterDate) : new Date("2025-05-25T15:00:00.000Z");

    if (isNaN(targetDate.getTime())) {
      throw new Error("Неверный формат даты. Используйте ISO формат, например: 2025-06-09T15:00:00.000Z");
    }

    return await this.checkerService.deleteUserResultsByCreationDate(targetDate);
  }
}
