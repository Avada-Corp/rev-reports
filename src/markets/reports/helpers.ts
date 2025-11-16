import { ApiByApi } from "../interfaces/index";
import { sendMessageAsync } from "../helpers";
import { getClient } from "../helpers/getClient";
import axios from "axios";
import { ApiPnlReport, TotalPnlReport } from "./interfaces";

const CANT_COUNT_TEXT_START_END = `не возможно посчитать, нет информации`;
const CANT_COUNT_PNL = "нет данных о pnl для расчетов";

function getFixedVal(val: number | null, text = CANT_COUNT_TEXT_START_END): string {
  return val != null ? val.toFixed(2) : text;
}

export function getApiReportText(report: ApiPnlReport): any {
  const { apiName, startDate, endDate, market, startPnl, endPnl, commissionVal, commissionInfo, cumulativePnl } =
    report;
  const period = `${startDate} - ${endDate}`;
  const divider = "------------------";
  const apiReport: string[] = ["<b>Отчет для API</b>: " + apiName];
  apiReport.push(...[`<b>${market}</b>`, `<b>Период</b>: ${period}`]);
  apiReport.push(divider);
  const resultNum: number | null =
    startPnl != null && endPnl != null && cumulativePnl != null ? cumulativePnl + endPnl - startPnl : null;
  apiReport.push(
    `<b>Дата</b>: ${startDate}`,
    `<b>P&L</b>:  ${getFixedVal(startPnl)}`,
    `------------------`,
    `<b>Дата</b>: ${endDate}`,
    `<b>P&L</b>:  ${getFixedVal(endPnl)}`,
    `------------------`
  );
  apiReport.push(`<b>Расчет по накопленному pnl</b>:  ${getFixedVal(cumulativePnl, CANT_COUNT_PNL)}`);
  apiReport.push(`------------------`, `<b>Итого по API</b>:  ${getFixedVal(resultNum, CANT_COUNT_PNL)}`);
  if ((commissionVal || 0) > 0) {
    apiReport.push(`------------------`);
    apiReport.push(
      "<b>Ваша комиссия</b>: " +
        (commissionInfo.percent != null ? commissionInfo.percent + "%" : commissionInfo.absolute + " USDT")
    );
    apiReport.push("<b>Комиссия итого</b>: " + commissionVal?.toFixed(2) + " USDT");
  } else {
    apiReport.push("<b>Нет комиссии</b>");
  }
  return apiReport.join("\r\n");
}
export function getUserReportText(reports: ApiPnlReport[], username: string): any {
  const userReport: string[] = ["---------Общий отчет пользователя---------", username];
  const { startDate, endDate } = reports[0];
  const period = `${startDate} - ${endDate}`;
  const divider = "------------------";
  let cumulativePnl: number | null = null;
  let pnlDelta: number | null = null;
  let userTotalCommission = 0;

  for (const report of reports) {
    const { commissionVal: cV, cumulativePnl: cP } = report;
    userTotalCommission += cV || 0;
    cumulativePnl = (cumulativePnl || 0) + (cP || 0);
    pnlDelta = (pnlDelta || 0) + (report.endPnl || 0) - (report.startPnl || 0);
  }

  const userTotalVal = (cumulativePnl || 0) + (pnlDelta || 0);

  userReport.push(`<b>Период</b>: ${period}`);
  userReport.push(divider);

  userReport.push(`<b>Посчитанный pnl</b>: ${cumulativePnl?.toFixed(2)}`);
  userReport.push(divider);
  userReport.push(`<b>Итого</b>: ${userTotalVal?.toFixed(2)}`);
  userReport.push(`<b>Общая комиссия</b>: ${userTotalCommission.toFixed(2)}`);
  return userReport.join("\r\n");
}

export function getTotalReportText(report: TotalPnlReport): string {
  const { commission, cumulativePnl, pnlDelta } = report;
  const fullReport = [
    `---------Full report-----------`,
    `Full pnl: ${cumulativePnl.toFixed(2)}`,
    `Full delta pnl: ${pnlDelta.toFixed(2)}`,
    `Total commission: ${commission.toFixed(2)}`
  ];
  return fullReport.join("\r\n");
}
export function getTotalReport(reports: ApiPnlReport[][]): TotalPnlReport {
  let commission = 0;
  let cumulativePnl = 0;
  let pnlDelta = 0;
  for (const report of reports.flat(2)) {
    const { commissionVal: cV, cumulativePnl: cP } = report;
    commission += cV || 0;
    cumulativePnl += cP || 0;
    pnlDelta = (pnlDelta || 0) + (report.endPnl || 0) - (report.startPnl || 0);
  }
  return {
    commission,
    cumulativePnl,
    pnlDelta
  };
}

export async function sendReports(userReports: ApiPnlReport[][], usernames: { email: string; username: string }[]) {
  const totalReport = getTotalReport(userReports);

  for (const userReport of userReports) {
    for (const apiReport of userReport) {
      // await sendMessageAsync(getApiReportText(apiReport));
    }
    const username = usernames.find((u) => u.email === userReport[0].email)?.username || userReport[0].email;
    // await sendMessageAsync(getUserReportText(userReport, username));
  }
  // await sendMessageAsync(getTotalReportText(totalReport));
}

export async function checkIsAvailableTransfersInfo(api: ApiByApi): Promise<boolean> {
  const history = await getClient(api).getTransferHistory(new Date().getTime() - 60 * 60 * 1000, new Date().getTime());
  return history.transfers != null;
}

export async function getApiCommission(
  apiKey: string,
  apiServerUrl: string | null,
  headers: { Authorization: string }
) {
  try {
    const url = apiServerUrl + "/api/getSoloApiCommissions";
    const { data } = await axios.post(
      url,
      { apiKey },
      {
        headers
      }
    );
    const { privateCommission, countedCommission } = data.data;
    const percent = privateCommission?.percent || null;
    const absolute = privateCommission?.absolute || null;
    if (percent != null || absolute != null) {
      return { percent, absolute };
    }
    return { percent: countedCommission, absolute: null };
  } catch (error) {
    console.error("error: ", error);
    return { percent: null, absolute: null };
  }
}

export function toLocale(date: number) {
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  return `${day}.${month}`;
}

export function toCents(val: string | number) {
  return Number(Math.round(Number(val) * 100).toFixed(0));
}
