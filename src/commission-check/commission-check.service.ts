import { Injectable } from "@nestjs/common";
import { DbService } from "src/db/db.service";
import { ApiService } from "src/markets/api.service";
import { CheckCommissionsResponse, ApiReportForCheck, ReportForCheck } from "src/markets/interfaces/index";

@Injectable()
export class CommissionCheckService {
  constructor(private readonly db: DbService, private readonly api: ApiService) {}

  /**
   * Проверяет комиссии пользователя за указанный период
   * НЕ записывает данные в БД и НЕ отправляет сообщения
   * Выводит детальную информацию в консоль и возвращает структурированный ответ
   */
  async checkUserCommissions(userEmail: string, startDate: number, endDate: number): Promise<CheckCommissionsResponse> {
    console.log("=== ПРОВЕРКА КОМИССИЙ ПОЛЬЗОВАТЕЛЯ ===");
    console.log(`Email: ${userEmail}`);
    console.log(`Период: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`);
    console.log("=====================================");

    try {
      // Получаем все необходимые данные (как в основном методе)
      const apiArray = await this.api.getApi();
      const userApis = apiArray.filter((api) => api.email === userEmail);

      if (userApis.length === 0) {
        const message = `Пользователь с email ${userEmail} не найден или у него нет API ключей`;
        console.log(message);
        return { status: false, error: message };
      }

      console.log(`Найдено API ключей: ${userApis.length}`);
      userApis.forEach((api, idx) => {
        console.log(`${idx + 1}. ${api.name} (${api.market})`);
      });

      // Получаем календарь пользователей (но НЕ используем стартовую дату из БД)
      const usersInfo = await this.db.getAllLastCommission();
      const userInfo = usersInfo.find((u) => u.email === userEmail);

      console.log("\n=== ИНФОРМАЦИЯ О ПОЛЬЗОВАТЕЛЕ ===");
      if (userInfo) {
        console.log(`Последняя дата комиссии в БД: ${new Date(userInfo.to).toLocaleDateString()}`);
        console.log(`ВНИМАНИЕ: Используем переданные даты, НЕ БД!`);
      } else {
        console.log("Пользователь не найден в истории комиссий");
      }

      // Создаем usersDatesMap с переданной startDate (не из БД!)
      const usersDatesMap = new Map();
      usersDatesMap.set(userEmail, startDate);

      // Получаем отчеты за период
      const allReports = await this.getAllReportsByDates(startDate, endDate, startDate, usersDatesMap);
      const userReports = allReports.filter((report) => report.email === userEmail);

      console.log(`\n=== ОТЧЕТЫ ЗА ПЕРИОД ===`);
      console.log(`Найдено отчетов: ${userReports.length}`);

      if (userReports.length === 0) {
        const message = "Нет отчетов за указанный период";
        console.log(message);
        return { status: false, error: message };
      }

      // Группируем отчеты по API
      const reportsByApi: Record<string, ReportForCheck[]> = userReports.reduce((acc, report) => {
        if (!acc[report.keyName]) {
          acc[report.keyName] = [];
        }
        acc[report.keyName].push(report);
        return acc;
      }, {} as Record<string, ReportForCheck[]>);

      // Получаем дополнительные данные для расчетов
      const usernameMap = await this.db.getUserNameMap();
      const allReferrers = await this.db.getAllReferrers();
      const userCommissions = await this.api.getUsersCommissions(endDate);
      const apisCommissions = await this.api.getApiCommissions(endDate);

      const userCommission = userCommissions.find((u) => u.email === userEmail);
      const userApiCommissions = apisCommissions.filter((u) => u.email === userEmail);

      if (!userCommission) {
        const message = "Настройки комиссий для пользователя не найдены";
        console.log(message);
        return { status: false, error: message };
      }

      console.log("\n=== НАСТРОЙКИ КОМИССИЙ ===");
      console.log(`Приватная комиссия - процент: ${userCommission.privateCommission.percent}%`);
      console.log(`Приватная комиссия - абсолютная: ${userCommission.privateCommission.absolute} USDT`);
      console.log(`Расчетная комиссия: ${userCommission.countedCommission}%`);
      console.log(`Баланс для комиссий: ${userCommission.balanceForCommissions} USDT`);

      const username = usernameMap.get(userEmail) || userEmail;
      const apiReferrers = allReferrers.find((a) => a.userEmail === userEmail) || null;

      let totalCommissionSum = 0;
      const detailedResults: ApiReportForCheck[] = [];

      console.log("\n=== ДЕТАЛЬНЫЙ РАСЧЕТ ПО API ===");

      // Обрабатываем каждый API
      for (const [apiName, reports] of Object.entries(reportsByApi)) {
        console.log(`\n--- API: ${apiName} ---`);

        const sortedReports = (reports as ReportForCheck[]).sort((a, b) => a.start - b.start);
        console.log("Отчеты: ", sortedReports);
        const firstReport = sortedReports[0];
        const lastReport = sortedReports[sortedReports.length - 1];

        console.log(`Отчетов: ${sortedReports.length}`);
        console.log(
          `Период: ${new Date(firstReport.start).toLocaleDateString()} - ${new Date(
            lastReport.to
          ).toLocaleDateString()}`
        );

        // Рассчитываем PnL
        const startPnl = firstReport.pnl || 0;
        const endPnl = lastReport.pnl || 0;
        const realizedPnl = sortedReports
          .filter((r) => r.start >= startDate)
          .reduce((acc, val) => acc + (val.pnlDaily || 0), 0);

        console.log(`PnL начальный: ${startPnl.toFixed(2)}`);
        console.log(`PnL конечный: ${endPnl.toFixed(2)}`);
        console.log(`Реализованный PnL за период: ${realizedPnl.toFixed(2)}`);

        // Получаем дельту API
        const lastApiDelta = await this.db.getLastApiDelta(userEmail, apiName);
        console.log(`Последняя дельта API: ${lastApiDelta.toFixed(2)}`);

        const pnlDelta = endPnl - startPnl;
        const totalProfit = realizedPnl + pnlDelta;
        const totalProfitWithDelta = totalProfit + lastApiDelta;

        console.log(`Дельта PnL: ${pnlDelta.toFixed(2)}`);
        console.log(`Общая прибыль: ${totalProfit.toFixed(2)}`);
        console.log(`Общая прибыль с дельтой: ${totalProfitWithDelta.toFixed(2)}`);

        // Рассчитываем комиссию
        let apiCommission = 0;
        let commissionSource = "Нет комиссии";

        const curApiPrivateCommission = userApiCommissions.find((a) => a.apiName === apiName)?.privateCommission || {
          percent: null,
          absolute: null
        };

        const percentCoefficient = totalProfitWithDelta / 100;

        if (curApiPrivateCommission.percent != null) {
          apiCommission = percentCoefficient * curApiPrivateCommission.percent;
          commissionSource = `API приватная комиссия: ${curApiPrivateCommission.percent}%`;
        } else if (curApiPrivateCommission.absolute != null) {
          apiCommission = curApiPrivateCommission.absolute;
          commissionSource = `API абсолютная комиссия: ${curApiPrivateCommission.absolute} USDT`;
        } else if (userCommission.privateCommission.percent != null) {
          apiCommission = percentCoefficient * userCommission.privateCommission.percent;
          commissionSource = `Пользовательская приватная комиссия: ${userCommission.privateCommission.percent}%`;
        } else if (userCommission.privateCommission.absolute != null) {
          apiCommission = 0; // Абсолютная комиссия не применяется к отдельным API
          commissionSource = "Пользовательская абсолютная комиссия (не применяется к API)";
        } else if (userCommission.countedCommission != null) {
          apiCommission = percentCoefficient * userCommission.countedCommission;
          commissionSource = `Расчетная комиссия: ${userCommission.countedCommission}%`;
        }

        console.log(`Источник комиссии: ${commissionSource}`);
        console.log(`Комиссия: ${apiCommission.toFixed(2)} USDT`);

        // Рассчитываем реферальные выплаты
        const refPaid = Object.values(apiReferrers?.refId || {})
          .filter((ref) => ref != null)
          .map((ref) => ({
            username: usernameMap.get(ref.email) || ref.email,
            email: ref.email,
            amount: ((apiCommission || 0) * this.getCommissionPercent(ref.levelName)) / 100,
            explanation: `Комиссия за ${ref.levelName} уровня, от пользователя ${userEmail}`
          }));

        const totalRefPaid = refPaid.reduce((sum, ref) => sum + ref.amount, 0);

        if (refPaid.length > 0) {
          console.log(`Реферальные выплаты:`);
          refPaid.forEach((ref) => {
            console.log(`  ${ref.username} (${ref.email}): ${ref.amount.toFixed(2)} USDT - ${ref.explanation}`);
          });
          console.log(`Общая сумма реферальных выплат: ${totalRefPaid.toFixed(2)} USDT`);
        } else {
          console.log("Реферальных выплат нет");
        }

        totalCommissionSum += apiCommission;

        detailedResults.push({
          apiName,
          startBalance: firstReport.totalBalance || 0,
          endBalance: lastReport.totalBalance || 0,
          startPnl,
          endPnl,
          realizedPnl,
          pnlDelta,
          totalProfit,
          totalProfitWithDelta,
          lastApiDelta,
          commission: apiCommission,
          commissionSource,
          refPaid,
          totalRefPaid,
          reportsCount: sortedReports.length,
          reports: reports
        });
      }

      // Применяем абсолютную комиссию если необходимо
      let finalTotalCommission = totalCommissionSum;
      if (
        userCommission.privateCommission.percent == null &&
        userApiCommissions.every((api) => api.privateCommission == null) &&
        userCommission.privateCommission.absolute != null
      ) {
        finalTotalCommission = userCommission.privateCommission.absolute;
        console.log(`\nПРИМЕНЯЕТСЯ АБСОЛЮТНАЯ КОМИССИЯ: ${finalTotalCommission} USDT`);
      }

      console.log("\n=== ИТОГОВЫЙ РЕЗУЛЬТАТ ===");
      console.log(`Пользователь: ${username} (${userEmail})`);
      console.log(`Период: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`);
      console.log(`Общая комиссия по API: ${totalCommissionSum.toFixed(2)} USDT`);
      console.log(`Итоговая комиссия: ${finalTotalCommission.toFixed(2)} USDT`);
      console.log("===============================");

      return {
        status: true,
        data: {
          userEmail,
          username,
          startDate: new Date(startDate).toLocaleDateString(),
          endDate: new Date(endDate).toLocaleDateString(),
          commissionSettings: {
            privatePercent: userCommission.privateCommission.percent,
            privateAbsolute: userCommission.privateCommission.absolute,
            countedCommission: userCommission.countedCommission,
            balanceForCommissions: userCommission.balanceForCommissions
          },
          totalCommissionByApis: totalCommissionSum,
          finalTotalCommission,
          apis: detailedResults,
          summary: {
            totalApis: detailedResults.length,
            totalReports: detailedResults.reduce((sum, api) => sum + api.reportsCount, 0),
            totalStartBalance: detailedResults.reduce((sum, api) => sum + api.startBalance, 0),
            totalEndBalance: detailedResults.reduce((sum, api) => sum + api.endBalance, 0),
            totalRealizedPnl: detailedResults.reduce((sum, api) => sum + api.realizedPnl, 0),
            totalPnlDelta: detailedResults.reduce((sum, api) => sum + api.pnlDelta, 0),
            totalRefPaid: detailedResults.reduce((sum, api) => sum + api.totalRefPaid, 0)
          }
        }
      };
    } catch (error) {
      console.error("Ошибка при проверке комиссий:", error);
      return {
        status: false,
        error: `Ошибка при проверке комиссий: ${error.message}`
      };
    }
  }

  /**
   * Получает отчеты за период (без фильтрации по датам из БД)
   */
  private async getAllReportsByDates(from: number, to: number, oldestDate: number, usersDatesMap: Map<string, number>) {
    const allReports = await this.db.getAllApiPnlReports(oldestDate, to);
    return allReports
      .filter((report) => this.isReportByDate(report, usersDatesMap, from))
      .map((report) => ({
        ...report,
        start: Number(report.start),
        to: Number(report.to)
      }));
  }

  /**
   * Проверяет попадает ли отчет в период
   */
  private isReportByDate(report: any, usersDatesMap: Map<string, number>, from: number): boolean {
    const userStartDate = usersDatesMap.get(report.email) || from;
    return report.to >= userStartDate;
  }

  /**
   * Возвращает процент комиссии по уровню реферальной программы
   */
  private getCommissionPercent(levelName: string): number {
    const COMMISSION_MAP = {
      "1": 20,
      "2": 7,
      "3": 3
    };
    return COMMISSION_MAP[levelName] || 0;
  }
}
