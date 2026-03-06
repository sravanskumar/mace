/**
 * V1: HTTP Basic Auth. V2 upgrade: replace axios auth block with IMS
 * token fetcher. No other files change.
 */

import "dotenv/config";
import axios, { type AxiosInstance } from "axios";

const AEM_BASE_URL = process.env.AEM_BASE_URL ?? "http://localhost:4502";
const AEM_USERNAME = process.env.AEM_USERNAME ?? "";
const AEM_PASSWORD = process.env.AEM_PASSWORD ?? "";
const AEM_TIMEOUT_MS = parseInt(process.env.AEM_TIMEOUT_MS ?? "30000", 10);

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
