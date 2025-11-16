import { Injectable } from '@nestjs/common';
import * as crypto from "crypto";
import { REPORTS_CONSTANTS } from '../reports.constants';
import { ReportsConfig } from '../reports.config';

@Injectable()
export class EncryptionService {
  constructor(private readonly reportsConfig: ReportsConfig) {}

  /**
   * Generates an encrypted report URL for the given email and date range
   */
  getReportUrl(email: string, startDate: number | string, endDate: number | string): string {
    const encryptedPayload = this.encryptData({
      email,
      start: new Date(startDate).getTime(),
      end: new Date(endDate).getTime()
    });
    
    return `${REPORTS_CONSTANTS.BASE_REPORT_URL}${encryptedPayload}`;
  }

  /**
   * Encrypts data using AES-256-CBC and returns base64 encoded string
   */
  private encryptData(data: Record<string, any>): string {
    const secretKey = this.reportsConfig.reportSecretKey;
    const dataToEncrypt = JSON.stringify(data);
    
    // Generate initialization vector and key
    const iv = crypto.randomBytes(16);
    const key = this.deriveKeyFromSecret(secretKey);
    
    // Encrypt the data
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encryptedData = cipher.update(dataToEncrypt, "utf8", "hex");
    encryptedData += cipher.final("hex");
    
    // Combine IV and encrypted data
    const encryptedPayload = `${iv.toString("hex")}:${encryptedData}`;
    
    // Encode as base64 for URL safety
    return Buffer.from(encryptedPayload).toString("base64");
  }

  /**
   * Derives encryption key from the secret
   */
  private deriveKeyFromSecret(secret: string): string {
    return crypto.createHash("sha256")
      .update(secret)
      .digest("base64")
      .substr(0, 32);
  }
}
