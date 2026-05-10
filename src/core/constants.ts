import { config } from "./config.js";

export const BASE_URLS = {
  api: config.baseUrl,
  comment: config.commentBaseUrl,
};

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
