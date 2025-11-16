import { Injectable } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { ApiByApi, Market, ResponseInterface } from "./interfaces/index";
import { firstValueFrom } from "rxjs";
import * as CryptoJS from "crypto-js";
import { CommissionApi, CommissionUser, SendTransactionDto } from "./reports/interfaces";
import { WalletReport } from "src/reports/interfaces";
import { ApiByApiWithUpdatedAt } from "./interfaces/index";

@Injectable()
export class ApiService {
  private readonly apiServerUrl: string;
  private readonly pass: string;
  private readonly headers: { Authorization: string };
  private readonly isWeeklyReportsByDefault: boolean;

  constructor(private readonly http: HttpService, private readonly config: ConfigService) {
    this.apiServerUrl = this.config.get("API_SERVER") || "";
    this.isWeeklyReportsByDefault = this.config.get("IS_WEEKLY_REPORTS_BY_DEFAULT") || false;
    this.pass = this.config.get("REPORTS_PASS") || "";
    this.headers = {
      Authorization: `Bearer ${this.config.get<number>("BEARER")}`
    };
  }

  async getUsersCommissions(to: number): Promise<CommissionUser[]> {
    return await this.get<CommissionUser>("getAllUsersCommissions/" + to);
  }

  async getApiCommissions(to: number): Promise<CommissionApi[]> {
    return await this.get<CommissionApi>("getAllApiCommissions/" + to);
  }

  private async get<T>(url: string): Promise<T[]> {
    const apiUrl = this.apiServerUrl + `/api/${url}`;
    const { data } = await firstValueFrom(this.http.get<ResponseInterface<T[]>>(apiUrl, { headers: this.headers }));
    return data.data || [];
  }

  private decryptSecret(encryptedSecret: string): string {
    try {
      const decrypted = CryptoJS.AES.decrypt(encryptedSecret, this.pass);
      const str = decrypted.toString(CryptoJS.enc.Utf8);

      if (str.length === 0) {
        return "";
      }

      return str;
    } catch (e) {
      console.error(`Catch decode string '${encryptedSecret}'`, e);
      return "";
    }
  }

  private shouldIncludeApi(api: ApiByApi, periodType?: "weekly" | "monthly"): boolean {
    if (!periodType) return true;

    if (api.commissionType == null) {
      return this.isWeeklyReportsByDefault ? periodType === "weekly" : periodType === "monthly";
    }

    return api.commissionType === periodType;
  }

  async getApi(periodType?: "weekly" | "monthly"): Promise<ApiByApiWithUpdatedAt[]> {
    const apis = await this.get<ApiByApiWithUpdatedAt>("getAllApi");

    return apis
      .filter((api) => this.shouldIncludeApi(api, periodType))
      .map((api) => ({
        email: api.email,
        key: api.key,
        secret: this.decryptSecret(api.secret),
        name: api.name,
        id: api.id,
        rev_id_orig: api.rev_id_orig,
        market: api.market,
        commissionType: api.commissionType,
        pass: api.pass || undefined,
        privateCommission: api.privateCommission,
        updatedAt: api.updatedAt,
        expirationDate: api.expirationDate
      }));
  }

  async getApiByEmail(email: string): Promise<ApiByApiWithUpdatedAt[]> {
    const apis = await this.get<ApiByApiWithUpdatedAt>("getAllApi");
    return apis
      .filter((a) => a.email === email)
      .map((api) => ({
        email: api.email,
        key: api.key,
        secret: this.decryptSecret(api.secret),
        name: api.name,
        id: api.id,
        rev_id_orig: api.rev_id_orig,
        market: api.market,
        commissionType: api.commissionType,
        pass: api.pass || undefined,
        privateCommission: api.privateCommission,
        updatedAt: api.updatedAt,
        expirationDate: api.expirationDate
      }));
  }

  async sendCommission(commission: SendTransactionDto) {
    const url = this.apiServerUrl + "/api/sendCommission";
    return await firstValueFrom(this.http.post(url, commission, { headers: this.headers }));
  }

  async getApiById(revId: string): Promise<ApiByApi | null> {
    const apis = await this.get<ApiByApi>("getAllApi");
    const api = apis.find((a) => a.rev_id_orig === revId) || null;
    if (api == null) {
      return null;
    }
    return {
      email: api.email,
      key: api.key,
      secret: this.decryptSecret(api.secret),
      name: api.name,
      id: api.id,
      rev_id_orig: api.rev_id_orig,
      market: api.market,
      commissionType: api.commissionType,
      pass: api.pass || undefined,
      privateCommission: api.privateCommission
    };
  }

  async sendWalletReport(report: WalletReport) {
    const url = this.apiServerUrl + "/admin/send-wallet-report";
    return await firstValueFrom(this.http.post(url, { report }, { headers: this.headers }));
  }

  async sendNegativeBalancesDataToUser(period: "weekly" | "monthly") {
    const url = this.apiServerUrl + "/admin/send-negative-balances-data-to-user/" + period;
    return await firstValueFrom(this.http.get(url, { headers: this.headers }));
  }
}
