/**
 * V1: HTTP Basic Auth. V2 upgrade: replace axios auth block with IMS
 * token fetcher. No other files change.
 */

import * as fs from "node:fs";
import axios, { type AxiosInstance } from "axios";

const AEM_BASE_URL = process.env.AEM_BASE_URL ?? "http://localhost:4502";
const AEM_USERNAME = process.env.AEM_USERNAME ?? "";
const AEM_PASSWORD = process.env.AEM_PASSWORD ?? "";
const AEM_TIMEOUT_MS = parseInt(process.env.AEM_TIMEOUT_MS ?? "30000", 10);

/** When set (e.g. MACE_LOG_AEM=1), log every AEM request and full response body to stderr (and optionally to a file). */
const LOG_AEM = /^(1|true|yes)$/i.test(process.env.MACE_LOG_AEM ?? "");
/** Optional path: also append AEM logs here so you can `tail -f` the file. */
const LOG_AEM_FILE = process.env.MACE_LOG_AEM_FILE?.trim() || null;
/** Max length of logged response body (truncated with "... [truncated]" if longer). */
const LOG_AEM_MAX_BODY = Math.min(100000, Math.max(0, parseInt(process.env.MACE_LOG_AEM_MAX_BODY ?? "15000", 10)));

function logAem(...lines: string[]): void {
  const text = lines.join("\n") + "\n";
  console.error(text);
  if (LOG_AEM_FILE) {
    try {
      fs.appendFileSync(LOG_AEM_FILE, text);
    } catch (e) {
      console.error("[MACE AEM] failed to write log file:", (e as Error).message);
    }
  }
}

if (!AEM_USERNAME.trim() || !AEM_PASSWORD) {
  console.error(
    "MACE: AEM_USERNAME and AEM_PASSWORD are required. Set them in .env or the environment."
  );
  process.exit(1);
}

const client: AxiosInstance = axios.create({
  baseURL: AEM_BASE_URL,
  auth: {
    username: AEM_USERNAME,
    password: AEM_PASSWORD,
  },
  timeout: AEM_TIMEOUT_MS,
});

if (LOG_AEM) {
  client.interceptors.request.use((config) => {
    const url = config.baseURL
      ? (config.baseURL.replace(/\/$/, "") + (config.url?.startsWith("/") ? config.url : "/" + (config.url ?? "")))
      : config.url;
    const withParams =
      config.params && Object.keys(config.params).length
        ? `${url}?${new URLSearchParams(config.params as Record<string, string>).toString()}`
        : url;
    logAem("[MACE AEM] → " + (config.method?.toUpperCase() ?? "GET") + " " + withParams);
    return config;
  });
  client.interceptors.response.use(
    (response) => {
      const url = response.config.url ?? "";
      const data = response.data;
      let body: string;
      if (data === null || data === undefined) {
        body = "null";
      } else if (typeof data === "object") {
        try {
          body = JSON.stringify(data, null, 2);
        } catch {
          body = String(data);
        }
      } else {
        body = String(data);
      }
      if (LOG_AEM_MAX_BODY > 0 && body.length > LOG_AEM_MAX_BODY) {
        body = body.slice(0, LOG_AEM_MAX_BODY) + "\n... [truncated, total " + body.length + " chars]";
      }
      logAem("[MACE AEM] ← " + response.status + " " + url, body);
      return response;
    },
    (error) => {
      const url = error.config?.url ?? "";
      const status = error.response?.status;
      const respData = error.response?.data;
      let body: string;
      if (respData !== undefined && respData !== null) {
        body = typeof respData === "object" ? JSON.stringify(respData, null, 2) : String(respData);
        if (LOG_AEM_MAX_BODY > 0 && body.length > LOG_AEM_MAX_BODY) {
          body = body.slice(0, LOG_AEM_MAX_BODY) + "\n... [truncated]";
        }
      } else {
        body = error.message;
      }
      logAem("[MACE AEM] ← " + (status ?? "ERR") + " " + url, body);
      return Promise.reject(error);
    }
  );
}

/** Resolved AEM base URL. */
export const BASE_URL: string = AEM_BASE_URL;

/**
 * GET request to AEM. Returns response data.
 */
export async function aemGet<T>(
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const { data } = await client.get<T>(path, { params });
  return data;
}

/**
 * POST request with application/x-www-form-urlencoded body.
 */
export async function aemPost(
  path: string,
  body: Record<string, string>
): Promise<void> {
  const encoded = new URLSearchParams(body).toString();
  await client.post(path, encoded, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}
