import { createHash } from "node:crypto";
import type { ApiEndpoint, BilibiliJsonEnvelope, Credential, RequestContext, RequestParams } from "./types.js";
import { appendBuvidCookies, getBuvidCookies } from "./buvid.js";
import { cacheManager } from "./cache.js";
import { BASE_URLS, DEFAULT_HEADERS, DEFAULT_RETRY_OPTIONS, FORM_CONTENT_TYPE, JSON_CONTENT_TYPE, OPUS_GOBACK_COOKIE, isBaseUrlName } from "./constants.js";
import { credentialManager, getBiliJct } from "./credential.js";
import { BilibiliAPIError, CommentsDisabledError, NetworkError } from "./errors.js";
import { fetchWithTimeout } from "./fetch.js";
import { withRetry } from "./retry.js";
import { addWbi2Params, clearWbiCache, withWbiSignature } from "./wbi.js";
import { getBiliTicket, getBiliTicketCached } from "./ticket.js";
import { config } from "./config.js";
import { appendCookieFragment } from "./cookies.js";

type NormalizedParams = Record<string, string | number>;

let lastRequestTime = 0;
let rateLimitQueue: Promise<void> = Promise.resolve();

export async function request<T>(
  endpoint: ApiEndpoint,
  params: RequestParams = {},
  ctx: RequestContext = {},
): Promise<T> {
  return performWithAuthRefresh(endpoint, params, ctx, false);
}

async function performWithAuthRefresh<T>(
  endpoint: ApiEndpoint,
  params: RequestParams,
  ctx: RequestContext,
  forceRefresh: boolean,
): Promise<T> {
  const maxAttempts = endpoint.wbi ? Math.max(1, config.wbiRetryTimes) : 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await performRequest(endpoint, params, ctx, forceRefresh);
    } catch (error) {
      lastError = error;
      // Pre-flight credential errors (synthesized, no originalError) never retry or refresh.
      if (error instanceof BilibiliAPIError && error.code === "BILIBILI_COOKIE_INVALID" && !error.originalError) {
        throw error;
      }
      if (endpoint.wbi && isWbiRecoverable(error) && attempt < maxAttempts - 1) {
        clearWbiCache();
        continue;
      }
      if (endpoint.auth && !ctx.credential && !forceRefresh && isAuthFailure(error)) {
        await credentialManager.markAuthFailureAndRefresh();
        return performRequest(endpoint, params, ctx, false);
      }
      throw error;
    }
  }
  throw lastError;
}

async function performRequest<T>(
  endpoint: ApiEndpoint,
  params: RequestParams,
  ctx: RequestContext,
  forceRefresh: boolean,
): Promise<T> {
  const normalizedParams = normalizeParams({ ...(endpoint.defaults ?? {}), ...params });
  const pathParams = new Set<string>();
  const url = buildUrl(endpoint, normalizedParams, pathParams);
  let requestParams = omitKeys(normalizedParams, pathParams);
  const headers: Record<string, string> = {
    ...DEFAULT_HEADERS,
    Accept: endpoint.response_type === "json" ? "application/json" : "*/*",
  };
  if (endpoint.referer) headers.Referer = endpoint.referer;

  const credential = await resolveCredential(endpoint, ctx, forceRefresh);
  if (endpoint.auth && !credential?.cookieHeader) {
    throw new BilibiliAPIError(
      "该接口需要登录态，请先通过 bilibili_config 配置 CookieCloud。",
      "BILIBILI_COOKIE_INVALID",
    );
  }
  if (endpoint.csrf && !getBiliJct(credential)) {
    throw new BilibiliAPIError(
      "缺少 bili_jct Cookie，无法提交需要 CSRF 的请求。",
      "BILIBILI_CSRF_MISSING",
    );
  }
  if (credential) headers.Cookie = credential.cookieHeader;

  const cacheKey = buildCacheKey(endpoint, url, requestParams, credential, ctx);
  if (cacheKey) {
    const cached = cacheManager.get<T>(cacheKey);
    if (cached !== undefined) return cached;
  }

  if (endpoint.buvid) {
    const buvid = await getBuvidCookies(ctx.signal);
    if (buvid) headers.Cookie = appendBuvidCookies(headers.Cookie, buvid);
  }

  headers.Cookie = appendCookieFragment(headers.Cookie, OPUS_GOBACK_COOKIE);

  if (config.enableBiliTicket && endpoint.wbi) {
    const ticket = await getBiliTicket(ctx.signal);
    const cachedInfo = getBiliTicketCached();
    if (ticket && cachedInfo) {
      headers.Cookie = appendBiliTicket(headers.Cookie, ticket, cachedInfo.expireAt);
    }
  }

  if (endpoint.wbi2) requestParams = addWbi2Params(requestParams);
  if (endpoint.wbi) {
    const signed = await withWbiSignature(endpoint.params_type === "query" ? requestParams : {}, ctx.signal);
    if (endpoint.params_type === "query") requestParams = signed;
    else appendQueryParams(url, signed);
  }

  const init: RequestInit = { method: endpoint.method, headers, signal: ctx.signal };
  if (endpoint.method === "GET" || endpoint.params_type === "query") {
    appendQueryParams(url, requestParams);
  } else {
    const bodyParams = { ...requestParams };
    if (endpoint.csrf) {
      const csrf = getBiliJct(credential);
      if (!csrf) {
        throw new BilibiliAPIError("缺少 bili_jct Cookie，无法提交需要 CSRF 的请求。", "BILIBILI_CSRF_MISSING");
      }
      bodyParams.csrf = csrf;
      bodyParams.csrf_token = csrf;
    }
    if (endpoint.content_type === "json") {
      headers["Content-Type"] = JSON_CONTENT_TYPE;
      init.body = JSON.stringify(bodyParams);
    } else {
      headers["Content-Type"] = FORM_CONTENT_TYPE;
      init.body = new URLSearchParams(stringifyParams(bodyParams));
    }
  }

  const result = await withRetry(async () => {
    const response = await throttledFetch(url, init);
    return parseResponse<T>(endpoint, response, url.toString());
  }, DEFAULT_RETRY_OPTIONS);
  if (cacheKey) cacheManager.set(cacheKey, result, getCacheTtlMs(endpoint));
  return result;
}

function normalizeParams(params: RequestParams): NormalizedParams {
  const normalized: NormalizedParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    normalized[key] = typeof value === "boolean" ? (value ? 1 : 0) : value;
  }
  return normalized;
}

function stringifyParams(params: NormalizedParams): Record<string, string> {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)]));
}

function buildUrl(endpoint: ApiEndpoint, params: NormalizedParams, pathParams: Set<string>): URL {
  const replaced = endpoint.url.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) {
      throw new BilibiliAPIError(`接口路径缺少参数：${name}`, "BILIBILI_ENDPOINT_INVALID");
    }
    pathParams.add(name);
    return encodeURIComponent(String(value));
  });
  if (/^https?:\/\//i.test(replaced)) return new URL(replaced);
  if (endpoint.base_url !== undefined && !isBaseUrlName(endpoint.base_url)) {
    throw new BilibiliAPIError(`未知 base_url：${endpoint.base_url}`, "BILIBILI_ENDPOINT_INVALID");
  }
  const base = endpoint.base_url ? BASE_URLS[endpoint.base_url] : BASE_URLS.api;
  return new URL(replaced, base);
}

function omitKeys(params: NormalizedParams, keys: Set<string>): NormalizedParams {
  return Object.fromEntries(Object.entries(params).filter(([key]) => !keys.has(key)));
}

function appendQueryParams(url: URL, params: NormalizedParams): void {
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.append(key, String(value));
  }
}

function buildCacheKey(
  endpoint: ApiEndpoint,
  url: URL,
  params: NormalizedParams,
  credential: Credential | undefined,
  ctx: RequestContext,
): string | undefined {
  if (ctx.cache !== true || endpoint.method !== "GET" || endpoint.response_type === "proto" || endpoint.response_type === "binary") {
    return undefined;
  }
  return stableJson({
    method: endpoint.method,
    url: url.toString(),
    params,
    response_type: endpoint.response_type,
    auth: endpoint.auth,
    credential: credential ? hashString(credential.cookieHeader) : "",
  });
}

function getCacheTtlMs(endpoint: ApiEndpoint): number {
  if (endpoint.url.includes("/x/player/videoshot")) return 24 * 60 * 60 * 1000;
  if (endpoint.url.includes("/x/v2/reply/")) return 30 * 60 * 1000;
  return 60 * 60 * 1000;
}

function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) =>
      `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function resolveCredential(
  endpoint: ApiEndpoint,
  ctx: RequestContext,
  forceRefresh: boolean,
): Promise<Credential | undefined> {
  if (!endpoint.auth && !endpoint.csrf) return ctx.credential;
  if (ctx.credential) return ctx.credential;
  try {
    return await credentialManager.refreshCredentials(forceRefresh);
  } catch (err) {
    if (err instanceof BilibiliAPIError && err.code === "COOKIECLOUD_CONFIG_INVALID") {
      return undefined;
    }
    throw err;
  }
}

async function throttledFetch(url: URL, init: RequestInit): Promise<Response> {
  const turn = rateLimitQueue.then(() => waitForRateLimit());
  rateLimitQueue = turn.catch(() => undefined);
  await turn;
  const response = await fetchWithTimeout(url, init);
  if (!response.ok) {
    throw new NetworkError(`HTTP ${response.status}: ${response.statusText}`, undefined, url.toString(), response.status);
  }
  return response;
}

async function waitForRateLimit(): Promise<void> {
  const delta = Date.now() - lastRequestTime;
  if (delta < config.rateLimitMs) {
    await new Promise((resolve) => setTimeout(resolve, config.rateLimitMs - delta));
  }
  lastRequestTime = Date.now();
}

async function parseResponse<T>(endpoint: ApiEndpoint, response: Response, url: string): Promise<T> {
  if (endpoint.response_type === "text") return (await response.text()) as T;
  if (endpoint.response_type === "proto" || endpoint.response_type === "binary") {
    return new Uint8Array(await response.arrayBuffer()) as T;
  }

  const payload = (await response.json()) as BilibiliJsonEnvelope<T>;
  if (typeof payload.code === "number" && payload.code !== 0) throw mapBilibiliError(payload, url);
  return (payload.data ?? payload.result ?? payload) as T;
}

function mapBilibiliError(payload: BilibiliJsonEnvelope, url: string): BilibiliAPIError {
  const code = Number(payload?.code);
  const message = payload?.message || payload?.msg || "未知错误";
  if (code === 12002) {
    return new CommentsDisabledError({ payload, url });
  }
  if (code === -101 || /未登录|登录|cookie/i.test(message)) {
    return new BilibiliAPIError("B 站登录态已失效。", "BILIBILI_COOKIE_INVALID", undefined, payload, true);
  }
  if (code === -352) {
    return new BilibiliAPIError("WBI 风控签名校验失败。", "BILIBILI_WBI_FAILED", undefined, payload, true);
  }
  if (code === -403 || code === -412) {
    return new BilibiliAPIError("当前请求被 B 站拒绝，通常是登录态或风控问题。", "BILIBILI_AUTH_REQUIRED", undefined, payload, true);
  }
  return new BilibiliAPIError(`${message} (${code})`, "API_ERROR", undefined, { payload, url }, false);
}

function appendBiliTicket(cookieHeader: string | undefined, ticket: string, expireAt: number): string {
  const ticketCookie = `bili_ticket=${ticket}; bili_ticket_expires=${Math.floor(expireAt / 1000)}`;
  return appendCookieFragment(cookieHeader, ticketCookie);
}

function isAuthFailure(error: unknown): boolean {
  return error instanceof BilibiliAPIError && ["BILIBILI_AUTH_REQUIRED", "BILIBILI_COOKIE_INVALID"].includes(error.code);
}

function isWbiRecoverable(error: unknown): boolean {
  // BILIBILI_WBI_FAILED ← -352; BILIBILI_AUTH_REQUIRED covers -403/-412.
  // Called only when endpoint.wbi=true, so -403 here means wbi key likely rotated.
  return error instanceof BilibiliAPIError && (
    error.code === "BILIBILI_WBI_FAILED" || error.code === "BILIBILI_AUTH_REQUIRED"
  );
}
