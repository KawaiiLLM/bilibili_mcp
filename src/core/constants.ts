import { config } from "./config.js";

const BASE_URL_NAMES = ["api", "comment"] as const;
export type BaseUrlName = (typeof BASE_URL_NAMES)[number];

export const BASE_URLS: Record<BaseUrlName, string> = {
  api: config.baseUrl,
  comment: config.commentBaseUrl,
};

export function isBaseUrlName(value: string | undefined): value is BaseUrlName {
  return typeof value === "string" && BASE_URL_NAMES.some((candidate) => candidate === value);
}

export const DEFAULT_HEADERS = {
  "User-Agent": config.userAgent,
  Referer: config.referer,
};

export const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded;charset=UTF-8";
export const JSON_CONTENT_TYPE = "application/json;charset=UTF-8";

export const DEFAULT_RETRY_OPTIONS = {
  maxRetries: 1,
  baseDelay: 250,
  maxDelay: 1000,
};
