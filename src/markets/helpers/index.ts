import axios from "axios";
import { ApiByApi } from "../interfaces/index";
import "dotenv/config";

export function timeout(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendMessageAsync(...text: string[]): Promise<void> {
  if (process.env.IS_SEND_REPORTS === "true") {
    return (
      (
        await axios
          .post(process.env.API_SERVER + "/actualization/sendMessage", {
            text
          })
          .then((v) => v.data)
      ).data || []
    );
  }
}

export async function sendImportantMessageAsync(...text: string[]): Promise<void> {
  try {
    const messageText = text.join("\n");
    if (messageText === "") {
      return;
    }
    if (process.env.IS_PRODUCTION === "true") {
      const url = process.env.API_SERVER + "/actualization/sendMessage";
      const data = {
        text: `${process.env.PREFIX}: ${messageText}`
      };
      await axios.post(url, data);
    }
  } catch (error) {
    console.error("sendImportantMessageAsync error: ", error);
  }
}

export function getSumOfArray(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}

interface SortedApi {
  [key: string]: ApiByApi[];
}

export function collapseByUser(apis: ApiByApi[] = []) {
  return apis.reduce<SortedApi>((acc, val) => {
    if (!acc[val.email]) {
      acc[val.email] = [];
    }
    acc[val.email].push(val);
    return acc;
  }, {});
}

export function getLastMonthLength() {
  const now = new Date();
  return 32 - new Date(now.getFullYear(), now.getMonth() - 1, 32).getDate();
}

export function envToBoolean(env: string | undefined) {
  return env === "true";
}

export function toLocale(timestamp: number | string): string {
  return new Date(timestamp).toLocaleDateString("ru-RU");
}
