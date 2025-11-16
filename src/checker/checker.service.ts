import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DbService } from "src/db/db.service";
import { ApiService } from "src/markets/api.service";
import { getClient } from "src/markets/helpers/getClient";
import { Balance, Market } from "src/markets/interfaces/index";
import { AccountPnlDocument } from "src/db/models/account-pnl.schema";
import { UserResultsDocument } from "src/db/models/user-results.schema";

export interface ReferralPnlHistory {
  email: string;
  username: string | null;
  level: number; // 1 - прямой реферал, 2 - сабреферал
  apis: {
    apiName: string;
    market: string;
    pnlHistory: {
      start: number;
      to: number;
      pnl: number;
      totalBalance: number;
      snapshotTime: number;
    }[];
  }[];
  totalPnl: number;
}

export interface ReferralsPnlReport {
  parentEmail: string;
  period: {
    start: number;
    to: number;
  };
  referrals: ReferralPnlHistory[];
  totalReferrals: number;
  totalPnl: number;
}

@Injectable()
export class CheckerService {
  private readonly logger = new Logger(CheckerService.name);
  apiServerUrl: string | null;
  backupServerUrl: string | null;
  salt: string | null;
  email: string | null;
  headers: { Authorization: string };

  constructor(
    private readonly config: ConfigService,
    private readonly api: ApiService,
    private readonly db: DbService // private readonly http: HttpService, // private readonly marketsService: MarketsService, // private readonly reportsService: ReportsService
  ) {
    this.apiServerUrl = this.config.get("API_SERVER") || null;
    this.backupServerUrl = this.config.get("BACKUP_SERVER") || null;
    this.headers = {
      Authorization: `Bearer ${this.config.get<number>("BEARER")}`
    };
  }

  // async getPairs() {
  //   const apiUrl = this.apiServerUrl + "/api/getAllTradePairs";
  //   return this.http.get<ResponseInterface<string[]>>(apiUrl, {
  //     headers: this.headers
  //   });
  // }

  async checkApiInfoByPnl(email: string, start: number, to: number) {
    const apis = await this.api.getApiByEmail(email);
    const api = apis[0];
    // const val = (await firstValueFrom(await this.getPairs()))?.data;
    // const pairs: string[] = val?.status ? val.data || [] : [];
    const client = getClient(api);
    const balance: Balance | null = await client.getBalance();
    const pnlDaily = await client.getPnl({
      start,
      to,
      pairs: []
    });
    const history = await client.getTransferHistory(start, to);
    console.log("balance: ", balance);
    console.log("pnlDaily: ", pnlDaily);
    return { balance, pnlDaily, history };
  }

  async getUserInfo(email: string, apiName: string) {
    const apis = await this.api.getApiByEmail(email);
    const api = apis.find((a) => a.name === apiName) || apis[0];
    if (!api) {
      throw new Error(`API ${apiName} not found`);
    }
    console.log("api: ", api);
    // const val = (await firstValueFrom(await this.getPairs()))?.data;
    // const pairs: string[] = val?.status ? val.data || [] : [];
    const client = getClient(api);
    const balance = await client.getUserInfo();
    return { balance };
  }

  // async checkTransferHistory(email: string, start: number, to: number) {
  //   console.log("checkTransferHistory: ", email, start, to);
  //   const apis = await this.api.getApiByEmail(email);
  //   console.log("apis: ", apis);
  //   if (apis.length === 0) {
  //     console.log("No api found");
  //     return;
  //   }
  //   const api = apis[0];
  //   const client = getClient(api);
  //   console.log("client: ", client);
  //   const { start: hisStart, to: hisTo } = await this.db.getHistoryRequestTime(api.id, start, to);
  //   console.log("hisStart: ", hisStart);
  //   console.log("hisTo: ", hisTo);
  //   const history = await client.getTransferHistory(hisStart, hisTo);
  //   console.log("history: ", history);
  //   return history;
  // }

  // /**
  //  * Временный метод для запуска makeReportWithDates и сохранения результата в файл.
  //  * @param start - Начальная дата (timestamp ms)
  //  * @param to - Конечная дата (timestamp ms)
  //  * @param reportType - Тип отчета ('weekly' | 'monthly')
  //  * @param outputFilename - Имя файла для сохранения результата (без расширения)
  //  */
  // async runAndLogReport(start: number, to: number, reportType: "weekly" | "monthly", isProduction: boolean) {
  //   this.logger.log(`Running report generation for comparison: ${start} - ${to} (${reportType})`);
  //   try {
  //     if (!this.api || !this.db || !this.http || !this.marketsService || !this.reportsService) {
  //       this.logger.error(
  //         "Некоторые зависимости CheckerService закомментированы. Раскомментируйте их для этого метода."
  //       );
  //       throw new Error("Missing dependencies in CheckerService constructor");
  //     }

  //     const result = await this.reportsService.makeReport(start, to, "weekly", isProduction);

  //     const filePath = path.join(__dirname, `../../${outputFilename}.json`);
  //     await fs.writeFile(filePath, JSON.stringify(result.walletReports, null, 2));
  //     this.logger.log(`Report results (walletReports) saved to ${filePath}`);

  //     return result;
  //   } catch (error) {
  //     this.logger.error(`Error during report generation for comparison: ${error.message}`, error.stack);
  //     throw error;
  //   }
  // }

  /**
   * Получает базу рефералов и сабрефералов с их историей PnL за период
   * @param email Email родительского пользователя
   * @param start Начало периода (timestamp ms)
   * @param to Конец периода (timestamp ms)
   * @returns Полный отчет по рефералам с историей PnL
   */
  async getReferralsPnlHistory(email: string, start: number, to: number): Promise<ReferralsPnlReport> {
    this.logger.log(`Получение истории PnL рефералов для ${email} за период ${start} - ${to}`);

    try {
      // Получаем рефералов пользователя
      this.logger.log(`Запрос рефералов из БД для ${email}`);
      const referrersResponse = await this.db.getReferrals(email);
      console.log("referrersResponse: ", referrersResponse);

      if (!referrersResponse?.status || !referrersResponse?.data) {
        this.logger.error(`Не удалось получить рефералов для ${email}: ${JSON.stringify(referrersResponse)}`);
        throw new Error(`Не удалось получить рефералов для ${email}`);
      }

      this.logger.log(`Успешно получены данные рефералов для ${email}`);
      const referralsData: ReferralPnlHistory[] = [];

      // Получаем username map
      this.logger.log(`Загрузка карты имен пользователей`);
      const usernameMap = await this.db.getUserNameMap();
      this.logger.log(`Загружено ${usernameMap.size} имен пользователей`);

      console.log("referrersResponse.data: ", referrersResponse.data);
      const apiPnlReports = await this.db.getAllApiPnlReports(start, to);
      if (referrersResponse.data.firstLevel && Array.isArray(referrersResponse.data.firstLevel)) {
        this.logger.log(
          `Обработка рефералов первого уровня: ${referrersResponse.data.firstLevel.length} пользователей`
        );
        let processedCount = 0;
        for (const email of referrersResponse.data.firstLevel) {
          this.logger.debug(
            `Обработка реферала первого уровня [${processedCount + 1}/${
              referrersResponse.data.firstLevel.length
            }]: ${email}`
          );
          const referralPnl = await this.getUserPnlHistory(email, start, to, usernameMap, 1, apiPnlReports);
          if (referralPnl) {
            referralsData.push(referralPnl);
            this.logger.debug(`Успешно обработан реферал ${email}, PnL: ${referralPnl.totalPnl}`);
          } else {
            this.logger.warn(`Не удалось получить данные PnL для реферала ${email}`);
          }
          processedCount++;
        }
        this.logger.log(
          `Завершена обработка рефералов первого уровня: ${processedCount} из ${referrersResponse.data.firstLevel.length}`
        );
      } else {
        this.logger.log(`Рефералы первого уровня отсутствуют`);
      }

      if (referrersResponse.data.secondLevel && Array.isArray(referrersResponse.data.secondLevel)) {
        this.logger.log(
          `Обработка рефералов второго уровня: ${referrersResponse.data.secondLevel.length} пользователей`
        );
        let processedCount = 0;
        for (const email of referrersResponse.data.secondLevel) {
          this.logger.debug(
            `Обработка реферала второго уровня [${processedCount + 1}/${
              referrersResponse.data.secondLevel.length
            }]: ${email}`
          );
          const subreferralPnl = await this.getUserPnlHistory(email, start, to, usernameMap, 2, apiPnlReports);
          if (subreferralPnl) {
            referralsData.push(subreferralPnl);
            this.logger.debug(`Успешно обработан сабреферал ${email}, PnL: ${subreferralPnl.totalPnl}`);
          } else {
            this.logger.warn(`Не удалось получить данные PnL для сабреферала ${email}`);
          }
          processedCount++;
        }
        this.logger.log(
          `Завершена обработка рефералов второго уровня: ${processedCount} из ${referrersResponse.data.secondLevel.length}`
        );
      } else {
        this.logger.log(`Рефералы второго уровня отсутствуют`);
      }

      if (referrersResponse.data.thirdLevel && Array.isArray(referrersResponse.data.thirdLevel)) {
        this.logger.log(
          `Обработка рефералов третьего уровня: ${referrersResponse.data.thirdLevel.length} пользователей`
        );
        let processedCount = 0;
        for (const email of referrersResponse.data.thirdLevel) {
          this.logger.debug(
            `Обработка реферала третьего уровня [${processedCount + 1}/${
              referrersResponse.data.thirdLevel.length
            }]: ${email}`
          );
          const thirdLevelPnl = await this.getUserPnlHistory(email, start, to, usernameMap, 3, apiPnlReports);
          if (thirdLevelPnl) {
            referralsData.push(thirdLevelPnl);
            this.logger.debug(`Успешно обработан реферал третьего уровня ${email}, PnL: ${thirdLevelPnl.totalPnl}`);
          } else {
            this.logger.warn(`Не удалось получить данные PnL для реферала третьего уровня ${email}`);
          }
          processedCount++;
        }
        this.logger.log(
          `Завершена обработка рефералов третьего уровня: ${processedCount} из ${referrersResponse.data.thirdLevel.length}`
        );
      } else {
        this.logger.log(`Рефералы третьего уровня отсутствуют`);
      }

      // Подсчитываем общий PnL
      this.logger.log(`Подсчет общего PnL для ${referralsData.length} рефералов`);
      const totalPnl = referralsData.reduce((sum, ref) => sum + ref.totalPnl, 0);
      this.logger.log(`Общий PnL рассчитан: ${totalPnl}`);

      const report: ReferralsPnlReport = {
        parentEmail: email,
        period: { start, to },
        referrals: referralsData,
        totalReferrals: referralsData.length,
        totalPnl
      };

      this.logger.log(`Отчет готов: ${referralsData.length} рефералов, общий PnL: ${totalPnl}`);
      return report;
    } catch (error) {
      this.logger.error(`Ошибка при получении истории PnL рефералов: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Получает историю PnL для конкретного пользователя
   */
  private async getUserPnlHistory(
    email: string,
    start: number,
    to: number,
    usernameMap: Map<string, string>,
    level: number,
    apiPnlReports: AccountPnlDocument[]
  ): Promise<ReferralPnlHistory | null> {
    try {
      this.logger.debug(`Начало обработки пользователя ${email} (уровень ${level})`);

      // Получаем API пользователя
      this.logger.debug(`Получение API для пользователя ${email}`);
      const userApis = await this.db.getUserInfo(email);

      if (!userApis || userApis.length === 0) {
        this.logger.warn(`Не найдено API для пользователя ${email}`);
        return null;
      }

      this.logger.debug(`Найдено ${userApis.length} API для пользователя ${email}`);

      const apisPnlHistory: {
        apiName: string;
        market: string;
        pnlHistory: {
          start: number;
          to: number;
          pnlDaily: number;
          pnl: number;
          totalBalance: number;
          snapshotTime: number;
        }[];
      }[] = [];
      let totalUserPnl = 0;

      // Проходим по всем API пользователя
      this.logger.debug(`Начало обработки API для пользователя ${email}`);
      for (let i = 0; i < userApis.length; i++) {
        const apiInfo = userApis[i];
        this.logger.debug(
          `Обработка API [${i + 1}/${userApis.length}] для ${email}: ${apiInfo.name || apiInfo.key?.substring(0, 8)}`
        );

        this.logger.debug(`Получено ${apiPnlReports.length} общих PnL отчетов за период`);

        const apiReports = apiPnlReports.filter((report) => report.keyId === apiInfo._id.toString());
        this.logger.debug(`Найдено ${apiReports.length} отчетов для API ${apiInfo._id} пользователя ${email}`);

        const pnlHistory = apiReports.map((report) => ({
          start: report.start,
          to: report.to,
          pnlDaily: report.pnlDaily,
          pnl: report.pnl,
          totalBalance: report.totalBalance,
          snapshotTime: report.snapshotTime
        }));

        const apiTotalPnl = pnlHistory.reduce((sum, item) => sum + (item.pnlDaily || 0), 0);
        totalUserPnl += apiTotalPnl;

        this.logger.debug(
          `API ${apiInfo.name || apiInfo.key?.substring(0, 8)} - PnL: ${apiTotalPnl}, записей: ${pnlHistory.length}`
        );

        apisPnlHistory.push({
          apiName: apiInfo.name || apiInfo.key?.substring(0, 8) + "...",
          market: apiInfo.market,
          pnlHistory
        });
      }

      this.logger.debug(
        `Завершена обработка пользователя ${email}: общий PnL ${totalUserPnl}, API: ${apisPnlHistory.length}`
      );

      return {
        email,
        username: usernameMap.get(email) || null,
        level,
        apis: apisPnlHistory,
        totalPnl: totalUserPnl
      };
    } catch (error) {
      this.logger.error(`Ошибка при получении PnL истории для ${email}: ${error.message}`);
      return null;
    }
  }

  /**
   * Обновляет дату истечения для всех Bybit API ключей
   * Получает все API, фильтрует только Bybit, получает количество дней до истечения
   * и обновляет записи в базе данных с полем expirationDay
   */
  async updateBybitApiExpirationDates() {
    try {
      this.logger.log(" Начинаю обновление дат истечения для Bybit API ключей");

      // Получаем все API
      const allApis = await this.api.getApi();
      this.logger.log(`Получено ${allApis.length} API ключей`);

      // Фильтруем только Bybit API
      const bybitApis = allApis.filter((api) => api.market === Market.Bybit);
      this.logger.log(`Найдено ${bybitApis.length} Bybit API ключей`);

      if (bybitApis.length === 0) {
        this.logger.log("Bybit API ключи не найдены");
        return { updated: 0, errors: 0 };
      }

      let updatedCount = 0;
      let errorCount = 0;

      // Обрабатываем каждый Bybit API
      for (const api of bybitApis) {
        try {
          this.logger.log(`Обработка API: ${api.name || api.key?.substring(0, 8) + "..."} (${api.email})`);

          // Получаем клиент для API
          const client = getClient(api);

          // Получаем количество дней до истечения
          const daysUntilExpiry = await client.getUserInfo(false);
          this.logger.log(`API ${api.name}: дней до истечения - ${daysUntilExpiry}`);

          // Вычисляем дату истечения на начало дня
          const currentDate = new Date();
          const expirationDate = new Date(currentDate.getTime() + daysUntilExpiry * 24 * 60 * 60 * 1000);
          // Устанавливаем время на начало дня (00:00:00)
          expirationDate.setHours(0, 0, 0, 0);
          const expirationTimestamp = expirationDate.getTime();
          console.log("expirationTimestamp: ", expirationTimestamp);

          this.logger.log(`Дата истечения для API ${api.name}: ${expirationDate.toISOString()}`);

          // Обновляем запись в базе данных
          await this.db.updateApiExpirationDate(api.id, expirationTimestamp);

          updatedCount++;
          this.logger.log(`Успешно обновлен API ${api.name}`);
        } catch (error) {
          errorCount++;
          this.logger.error(
            `Ошибка при обработке API ${api.name || api.key?.substring(0, 8) + "..."}: ${error.message}`
          );
        }
      }

      this.logger.log(`Обновление завершено. Успешно: ${updatedCount}, Ошибок: ${errorCount}`);

      return {
        total: bybitApis.length,
        updated: updatedCount,
        errors: errorCount
      };
    } catch (error) {
      this.logger.error(`Общая ошибка при обновлении дат истечения: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Ищет проблемные транзакции - находит записи с отрицательной reportDelta
   * и возвращает все записи с тем же start и email
   */
  async getProblematicTransactions() {
    try {
      this.logger.log("Начинаю поиск проблемных транзакций ");

      // Находим все записи с отрицательной reportDelta
      const problematicResults = await this.db.getUserResultsWithNegativeDelta();
      this.logger.log(`Найдено ${problematicResults.length} записей с отрицательной reportDelta`);

      if (problematicResults.length === 0) {
        return [];
      }

      // Получаем все связанные записи с теми же start и end
      const allRelatedResults: UserResultsDocument[] = [];
      for (const problematicResult of problematicResults) {
        const relatedResults = await this.db.getUserResultsByEmailStartAndEnd(
          problematicResult.email,
          problematicResult.startDate,
          problematicResult.endDate
        );
        allRelatedResults.push(...relatedResults);
      }

      this.logger.log(`Найдено ${allRelatedResults.length} связанных записей`);

      return allRelatedResults;
    } catch (error) {
      this.logger.error(`Ошибка при поиске проблемных транзакций: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Получает все записи из коллекции userresults, созданные после указанной даты
   * @param afterDate Дата, после которой нужно найти записи
   * @returns Массив записей UserResults
   */
  async getUserResultsByCreationDate(afterDate: Date): Promise<UserResultsDocument[]> {
    try {
      this.logger.log(`Поиск записей UserResults созданных после ${afterDate.toISOString()}`);

      const results = await this.db.getUserResultsByCreationDate(afterDate);

      this.logger.log(`Найдено ${results.length} записей UserResults`);
      return results;
    } catch (error) {
      this.logger.error(`Ошибка при поиске записей UserResults: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Удаляет все записи из коллекции userresults, созданные после указанной даты
   * @param afterDate Дата, после которой нужно удалить записи
   * @returns Количество удаленных записей
   */
  async deleteUserResultsByCreationDate(afterDate: Date): Promise<{ deletedCount: number }> {
    try {
      this.logger.log(`Удаление записей UserResults созданных после ${afterDate.toISOString()}`);

      const result = await this.db.deleteUserResultsByCreationDate(afterDate);

      this.logger.log(`Удалено ${result.deletedCount} записей UserResults`);
      return result;
    } catch (error) {
      this.logger.error(`Ошибка при удалении записей UserResults: ${error.message}`, error.stack);
      throw error;
    }
  }
}
