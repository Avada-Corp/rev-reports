import { Injectable } from "@nestjs/common";
import { Balance, TransferHistory, Transfers } from "src/markets/interfaces/index";
import { Model, Types, UpdateWriteOpResult } from "mongoose";
import { AccountDocument } from "./models/account.schema";
import { InjectModel } from "@nestjs/mongoose";
import axios from "axios";
import { sendImportantMessageAsync } from "src/markets/helpers";
import { AccountPnl, AccountPnlDocument } from "./models/account-pnl.schema";
import { json2csv } from "json-2-csv";
import { ConfigService } from "@nestjs/config";
import { Rep } from "./../markets/interfaces/index";
import { CommissionUser, LastCommissionUser, Referrer, ReferrerData } from "src/markets/reports/interfaces";
import { UserResults, UserResultsDocument } from "./models/user-results.schema";
import { UserDocument } from "./models/user.schema";

interface IDbService {
  start: number;
  history: TransferHistory;
  balance: Balance;
  to: number;
  pnlDaily: number | null;
  keyId: string;
  notForTransferCount?: boolean;
  snapshotTime: number;
  username: string;
  market: string;
  keyName: string;
}

interface PnlHistory {
  start: number;
  to: number;
  keyId: string;
  balance: Balance;
  pnlDaily: number;
  snapshotTime: number;
  username: string;
  market: string;
  email: string;
  keyName: string;
}

interface PnlUpdateHistory {
  start: number;
  to: number;
  keyId: string;
  pnlDaily: number;
  snapshotTime: number;
}

export interface UserReport {
  _id: string;
  email: string;
  name: string;
  rev_id: string;
  key: string;
  botIds: any[];
  market: string;
  isTransferHistoryAvailable: boolean;
}

@Injectable()
export class DbService {
  private readonly apiServerUrl: string | null;
  private usernamesCache: { data: any[]; timestamp: number } | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 минут

  constructor(
    @InjectModel("History") private accountModel: Model<AccountDocument>,
    @InjectModel("usersInfo") private userModel: Model<UserDocument>,
    @InjectModel("PnlHistory") private accountPnlModel: Model<AccountPnlDocument>,
    @InjectModel("UserResults") private userResultsModel: Model<UserResultsDocument>,
    private readonly config: ConfigService
  ) {
    this.apiServerUrl = this.config.get("API_SERVER") || null;
  }

  async getApiInfo(id: string, to: number, isFindFirst = false) {
    let report = await this.accountPnlModel.findOne({ to, keyId: id }).lean();
    if (report == null && isFindFirst) {
      do {
        to += 24 * 60 * 60 * 1000;
        report = await this.accountPnlModel.findOne({ to, keyId: id }).lean();
      } while (report == null && to < new Date().getTime());
    }
    return report;
  }

  async getLast2Reports(keyId: string) {
    const reports = await this.accountModel.find({ keyId }).sort({ to: "desc" }).lean().exec();
    return { prevReport: reports[1], lastReport: reports[0] };
  }

  async getLastReport(keyId: string) {
    const reports = await this.accountModel.find({ keyId }).sort({ to: "desc" }).lean().exec();
    return reports[0];
  }

  async getHistoryRequestTime(id: string, start: number, to: number): Promise<{ start: number; to: number }> {
    const report = await this.accountModel
      .find({ to: { $lte: start }, keyId: id })
      .sort({ to: "desc" })
      .exec();
    if (report.length === 0) {
      return { start: new Date().getTime(), to: new Date().getTime() };
    }
    const startTime = report[0]?._id?.getTimestamp?.()?.getTime() || start;
    // await sendImportantMessageAsync(
    //   "Используем время старта отчета трансферов: " +
    //     startTime +
    //     ": " +
    //     new Date(startTime).toLocaleDateString() +
    //     new Date(startTime).toLocaleTimeString()
    // );
    return { start: startTime, to };
  }

  async getHistoriesToFillTransfers(id: string, start: number): Promise<AccountDocument[]> {
    const reports = await this.accountModel.find({ start: { $gte: start }, keyId: id, transfers: null }).lean();
    return reports;
  }

  async updateHistory({ start, to, keyId }: AccountDocument, transfers: Transfers): Promise<UpdateWriteOpResult> {
    const updated = await this.accountModel.updateOne({ start, to, keyId }, { transfers });
    return updated;
  }

  async getCumulativePnl(id: string, from: number, to: number): Promise<number> {
    const req = { start: { $gte: from }, to: { $lte: to }, keyId: id };
    const reports = await this.accountPnlModel.find(req).lean();
    return reports.reduce((cumPnl, report) => cumPnl + (report.pnlDaily || 0), 0);
  }

  async getAllApiPnlReports(from: number, to: number): Promise<AccountPnlDocument[]> {
    const req = { to: { $gte: Number(from), $lte: Number(to) } };
    const projection = {
      start: 1,
      to: 1,
      keyId: 1,
      pnl: 1,
      pnlDaily: 1,
      totalBalance: 1,
      username: 1,
      market: 1,
      keyName: 1,
      email: 1,
      _id: 1
    };
    const data: AccountPnlDocument[] = await this.accountPnlModel
      .find(req, projection)
      .sort({ keyId: 1, to: 1 })
      .lean();
    return data;
  }

  async getApiPnlReportsByToValues(toValues: number[]): Promise<AccountPnlDocument[]> {
    const projection = {
      start: 1,
      to: 1,
      keyId: 1,
      pnl: 1,
      pnlDaily: 1,
      totalBalance: 1,
      username: 1,
      market: 1,
      keyName: 1,
      email: 1,
      _id: 1
    };
    const data: AccountPnlDocument[] = await this.accountPnlModel.find({ to: { $in: toValues } }, projection).lean();
    return data;
  }

  async getAllApiPnlReportsByEmail(from: number, to: number, email: string): Promise<AccountPnlDocument[]> {
    const req = { to: { $gte: Number(from), $lte: Number(to) }, email };
    const projection = {
      start: 1,
      to: 1,
      keyId: 1,
      pnl: 1,
      pnlDaily: 1,
      totalBalance: 1,
      username: 1,
      market: 1,
      keyName: 1,
      email: 1,
      _id: 1
    };
    const data: AccountPnlDocument[] = await this.accountPnlModel
      .find(req, projection)
      .sort({ keyId: 1, to: 1 })
      .lean();
    return data;
  }

  async getUserInfo(email: string): Promise<any> {
    const users = await this.userModel.aggregate([
      {
        $match: { email }
      },
      { $unwind: "$api" },
      {
        $project: {
          _id: "$api._id",
          email: "$email",
          name: "$api.name",
          rev_id: "$api.rev_id",
          key: "$api.key",
          botIds: "$api.botIds",
          market: "$api.market",
          isTransferHistoryAvailable: "$api.isTransferHistoryAvailable"
        }
      }
    ]);
    return users;
  }

  async getApiByEmailAndName(email: string, apiName: string): Promise<{ rev_id: string } | null> {
    const result = await this.userModel.aggregate([
      { $unwind: "$api" },
      {
        $match: {
          email: email,
          "api.name": apiName
        }
      },
      {
        $project: {
          rev_id: "$api.rev_id"
        }
      }
    ]);
    return result.length > 0 ? result[0] : null;
  }

  async getUsersForReports(): Promise<UserReport[]> {
    const users = await this.userModel.aggregate([
      {
        $match: {}
      },
      { $unwind: "$api" },
      {
        $project: {
          _id: "$api._id",
          email: "$email",
          name: "$api.name",
          rev_id: "$api.rev_id",
          key: "$api.key",
          botIds: "$api.botIds",
          market: "$api.market",
          isTransferHistoryAvailable: "$api.isTransferHistoryAvailable"
        }
      },
      { $sort: { email: 1, name: 1 } }
    ]);
    return users;
  }

  async getUsersForReportsByEmail(email: string): Promise<UserReport[]> {
    const users = await this.userModel.aggregate([
      {
        $match: { email }
      },
      { $unwind: "$api" },
      {
        $project: {
          _id: "$api._id",
          email: "$email",
          name: "$api.name",
          rev_id: "$api.rev_id",
          key: "$api.key",
          botIds: "$api.botIds",
          market: "$api.market",
          isTransferHistoryAvailable: "$api.isTransferHistoryAvailable"
        }
      },
      { $sort: { name: 1 } }
    ]);
    return users;
  }

  async getAllApiReports(from: number, to: number): Promise<any> {
    const req = { to: { $gte: from, $lte: to } };
    const projection = {
      start: 1,
      to: 1,
      keyId: 1,
      transfers: 1,
      totalBalance: 1,
      pnl: 1,
      pnlDaily: 1,
      username: 1,
      market: 1,
      keyName: 1,
      _id: 1
    };
    const reports = await this.accountModel.find(req, projection).sort({ keyId: 1, to: 1 }).lean();
    console.info("getAllApiReports: ", reports.length);
    return reports;
  }

  async getAllApiLastReports(to: number): Promise<any> {
    const req = { to };
    const projection = {
      start: 1,
      to: 1,
      keyId: 1,
      transfers: 1,
      totalBalance: 1,
      pnl: 1,
      pnlDaily: 1,
      username: 1,
      market: 1,
      keyName: 1,
      _id: 1
    };
    const reports = await this.accountModel.find(req, projection).sort({ keyId: 1, to: 1 }).lean();
    console.info("getAllApiLastReports getAllApiReports: ", reports.length);
    return reports;
  }

  async getApiTransfersInfo(id: string, from: number, to: number): Promise<TransferHistory> {
    const req = { start: { $gte: from }, to: { $lte: to }, keyId: id };
    const reports = await this.accountModel.find(req).lean();
    const transfers: TransferHistory = {
      transfers: {
        deposits: reports.map((r) => r.transfers?.deposits || []).flat(),
        withdrawals: reports.map((r) => r.transfers?.withdrawals || []).flat()
      }
    };
    return transfers;
  }

  async getUserNameByApiKey(key: string) {
    const url = this.apiServerUrl + "/api/getUserByKey/" + key;
    return axios.get<{ status: boolean; data: string }>(url).then((r) => r.data);
  }

  async getUsernames() {
    // Проверяем кэш
    if (this.usernamesCache && Date.now() - this.usernamesCache.timestamp < this.CACHE_TTL) {
      return this.usernamesCache;
    }

    const url = this.apiServerUrl + "/api/getUsernames/";
    const names = await axios.get(url).then((r) => r.data);

    // Сохраняем в кэш
    this.usernamesCache = {
      data: names.data || [],
      timestamp: Date.now()
    };

    return names;
  }

  async getUserNameMap() {
    const usernames = (await this.getUsernames())?.data || [];
    const usernameMap: Map<string, string> = new Map();
    usernames.forEach((user) => {
      usernameMap.set(user.email, user.username);
    });
    return usernameMap;
  }

  async getAllLastCommission() {
    const url = this.apiServerUrl + "/api/getLastCommissions/";
    const commissions = await axios.get(url).then((r) => r.data);
    return commissions.data;
  }

  async getLastCommissionByEmail(
    email: string
  ): Promise<{ status: boolean; data: { start: number; to: number; email: string } | null }> {
    const url = this.apiServerUrl + "/api/getLastUserCommissions/" + email;
    const commissions = await axios
      .get<{ status: boolean; data: { start: number; to: number; email: string } | null }>(url)
      .then((r) => r.data);
    console.log("commissions: ", commissions);
    return commissions;
  }

  async getReferrers(email: string) {
    const url = this.apiServerUrl + "/api/getReferrersByEmail/";
    return await axios.post(url, { email }).then((r) => r.data);
  }

  async getReferrals(email: string) {
    const url = this.apiServerUrl + "/api/getReferralsByEmail/";
    return await axios.post(url, { email }).then((r) => r.data);
  }

  async getAllReferrers() {
    const url = this.apiServerUrl + "/api/getAllReferrers/";
    return (await axios.get<Referrer>(url).then((r) => r.data))?.data || [];
  }

  async getUserReferrers(email: string) {
    const url = this.apiServerUrl + `/api/getUserReferrers/${email}`;
    return (await axios.get<Referrer>(url).then((r) => r.data))?.data || [];
  }

  async updateApiTransferStatus(email: string, apiKey: string, transferStatus: boolean) {
    const url = this.apiServerUrl + "/api/updateTransferStatus";
    const { data } = await axios.post(url, { email, apiKey, transferStatus });
    return data;
  }

  async updateApiExpirationDate(apiId: string, expirationDate: number) {
    const result = await this.userModel.findOneAndUpdate(
      { "api._id": new Types.ObjectId(apiId) },
      {
        $set: {
          "api.$.expirationDate": expirationDate
        }
      },
      { new: true }
    );
    // console.log("result: ", result);
    return result;
  }

  async savePnlInfo({
    start,
    balance,
    to,
    keyId,
    pnlDaily,
    snapshotTime,
    username,
    market,
    keyName,
    email
  }: PnlHistory): Promise<AccountDocument | null> {
    const { pnl, balanceResponse, total } = balance;
    let balRespVal = "";
    try {
      balRespVal = JSON.stringify(balanceResponse);
    } catch (error) {
      console.error("JSON.stringify(balanceResponse) error: ", error);
    }
    const account: AccountPnl = {
      start,
      to,
      snapshotTime,
      pnl: pnl || 0,
      keyId,
      pnlDaily,
      balanceResponse: balRespVal,
      username,
      market,
      keyName,
      email,
      totalBalance: total || 0
    };

    return (
      this.accountPnlModel.findOneAndUpdate({ keyId, start, to }, account, {
        upsert: true,
        new: true
      }) || null
    );
  }

  async updatePnlInfo({ start, to, keyId, pnlDaily, snapshotTime }: PnlUpdateHistory): Promise<AccountDocument | null> {
    const account: Partial<AccountPnl> = {
      start,
      to,
      snapshotTime,
      keyId,
      pnlDaily
    };

    return (
      this.accountPnlModel.findOneAndUpdate({ keyId, start, to }, account, {
        upsert: true,
        new: true
      }) || null
    );
  }

  async saveApiInfo({
    start,
    history,
    balance,
    to,
    keyId,
    pnlDaily,
    notForTransferCount,
    snapshotTime,
    username,
    market,
    keyName
  }: IDbService): Promise<AccountDocument | null> {
    const { total, pnl, balanceResponse } = balance;
    const { transfers } = history;
    let balRespVal = "";
    try {
      balRespVal = JSON.stringify(balanceResponse);
    } catch (error) {
      console.error("JSON.stringify(balanceResponse) error: ", error);
    }
    const account = {
      start,
      to,
      transfers,
      totalBalance: total,
      balanceResponse: balRespVal,
      pnl,
      keyId,
      pnlDaily,
      notForTransferCount,
      snapshotTime,
      username,
      market,
      keyName
    };

    return (
      this.accountModel.findOneAndUpdate({ keyId, start, to }, account, {
        upsert: true,
        new: true
      }) || null
    );
  }

  async getReports(from: number, to: number) {
    const reports = await this.accountModel.find({
      to: { $gte: from, $lte: to }
    });
    return reports;
  }

  async getUserReportsCsv() {
    const reports = await this.accountModel
      .find({
        keyId: "64e516f00b5242f46eea1790"
      })
      .lean();
    const pnlReports = await this.accountPnlModel
      .find({
        keyId: "64e516f00b5242f46eea1790"
      })
      .lean();
    const fullReport = reports.map((r) => {
      const totalBalance = r.totalBalance;
      const curPnl = r.pnl;
      const avalBalance = (totalBalance || 0) + (curPnl || 0);
      const to = r.to;
      const pnlDaily = pnlReports.find((p) => p.to === to)?.pnlDaily ?? "No data";
      return {
        "Total Balance": totalBalance,
        "Pnl on date": curPnl,
        "Avail Balance": avalBalance,
        "Closed pnl daily": pnlDaily,
        Date: new Date(to).toLocaleDateString()
      };
    });
    const csv = await json2csv(fullReport);
  }

  async getPnlReports(from: number, to: number) {
    return this.accountPnlModel.find({
      to: { $gte: from, $lte: to }
    });
  }

  async getPnlReportsByEmail(from: number, to: number, email: string) {
    console.log("getPnlReportsByEmail: ", from, to, email);
    return this.accountPnlModel.find({
      to: { $gte: from, $lte: to },
      email
    });
  }

  async getApiReport(start: number, to: number, apiKey: string) {
    return this.accountModel.find({
      to,
      start,
      keyId: apiKey
    });
  }

  async getApiPnlReport(start: number, to: number, apiKey: string) {
    return this.accountPnlModel.find({
      to,
      start,
      keyId: apiKey
    });
  }

  async getAllReports() {
    return this.accountModel.find();
  }

  async saveReport(rep: Rep) {
    const r = await this.accountModel.findOneAndUpdate({ keyId: rep.keyId, start: rep.start, to: rep.to }, rep);
  }

  async updatePnlHistoriesToEmail() {
    const usernames = (await this.getUsernames())?.data || [];
    const usernameMap: Map<string, string> = new Map();
    usernames.forEach((user) => {
      usernameMap.set(user.username, user.email);
    });

    const pnlHistories = await this.accountPnlModel.find({ username: { $exists: true }, email: { $exists: false } });
    console.log(`Found ${pnlHistories.length} records to process`);

    let updatedCount = 0;
    let notFoundCount = 0;
    const notFoundUsernames: string[] = [];

    for (const history of pnlHistories) {
      const email = usernameMap.get(history.username);
      if (email != null) {
        await this.accountPnlModel
          .findOneAndUpdate(
            { keyId: history.keyId, start: history.start, to: history.to },
            { email },
            {
              upsert: true,
              new: true
            }
          )
          .lean();
        updatedCount++;
        if (updatedCount % 50 === 0) {
          console.log(`Processed ${updatedCount} records... `);
        }
      } else if (/^\d+@tg\.login$/.test(history.username)) {
        await this.accountPnlModel.findOneAndUpdate(
          { keyId: history.keyId, start: history.start, to: history.to },
          { $set: { email: history.username } }
        );
        updatedCount++;
        if (updatedCount % 50 === 0) {
          console.log(`Processed ${updatedCount} records... `);
        }
      } else {
        notFoundUsernames.push(history.username);
        console.log("notFoundUsernames: ", history.username);
        notFoundCount++;
      }
    }

    console.log(`Processing completed. Updated: ${updatedCount}, Not found: ${notFoundCount}`);
    if (notFoundUsernames.length > 0) {
      console.log("Not found usernames:", notFoundUsernames);
    }
  }

  async updatePnlHistory({
    keyId,
    start,
    email,
    username,
    keyName
  }: {
    start: number;
    keyId: string;
    email: string;
    username: string;
    keyName: string;
  }) {
    const updated = await this.accountPnlModel.findOneAndUpdate(
      { keyId, start },
      { email, username, keyName },
      {
        upsert: true,
        new: true
      }
    );
  }

  async saveUserResults(userResults: UserResults): Promise<UserResultsDocument> {
    const newUserResults = new this.userResultsModel(userResults);
    return newUserResults.save();
  }

  async getLastApiDelta(email: string, apiName: string): Promise<number> {
    const lastResult = await this.userResultsModel.findOne({ email }).sort({ endDate: -1 }).lean();

    if (!lastResult) {
      return 0;
    }

    const api = lastResult.apis.find((api) => api.apiName === apiName);
    return api?.reportDelta || 0;
  }

  async getUserResultsWithNegativeDelta(): Promise<UserResultsDocument[]> {
    return this.userResultsModel
      .find({
        "apis.reportDelta": { $lt: 0 }
      })
      .lean();
  }

  async getUserResultsByEmailAndStart(email: string, startDate: number): Promise<UserResultsDocument[]> {
    return this.userResultsModel
      .find({
        email,
        startDate
      })
      .lean();
  }

  async getUserResultsByEmailAndStartExcludingEndDate(
    email: string,
    startDate: number,
    excludeEndDate: number
  ): Promise<UserResultsDocument[]> {
    return this.userResultsModel
      .find({
        email,
        startDate,
        endDate: { $ne: excludeEndDate }
      })
      .lean();
  }

  async getUserResultsByEmailStartAndEnd(
    email: string,
    startDate: number,
    endDate: number
  ): Promise<UserResultsDocument[]> {
    return this.userResultsModel
      .find({
        email,
        startDate,
        endDate
      })
      .lean();
  }

  async getUserResultsByCreationDate(afterDate: Date): Promise<UserResultsDocument[]> {
    // Создаем ObjectId из даты для сравнения
    const objectIdFromDate = new Types.ObjectId(Math.floor(afterDate.getTime() / 1000));

    const results = await this.userResultsModel
      .find({
        _id: { $gte: objectIdFromDate }
      })
      .lean();

    return results;
  }

  async deleteUserResultsByCreationDate(afterDate: Date): Promise<{ deletedCount: number }> {
    // Создаем ObjectId из даты для сравнения
    const objectIdFromDate = new Types.ObjectId(Math.floor(afterDate.getTime() / 1000));

    const result = await this.userResultsModel.deleteMany({
      _id: { $gte: objectIdFromDate }
    });

    return { deletedCount: result.deletedCount || 0 };
  }
}
