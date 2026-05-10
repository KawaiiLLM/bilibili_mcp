import { config as loadDotenv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  loadDotenv({ path: resolve(__dirname, "../../.env") });
} catch {
  // .env is optional.
}

export interface Config {
  logLevel: "debug" | "info" | "warn" | "error" | "silent";
  rateLimitMs: number;
  requestTimeoutMs: number;
  wbiCacheExpirationMs: number;
  maxCacheSize: number;
  baseUrl: string;
  commentBaseUrl: string;
  userAgent: string;
  referer: string;
  cookieCloudEndpoint: string;
  cookieCloudUuid: string;
  cookieCloudPassword: string;
  cookieCloudDomains: string[];
  cookieRefreshIntervalMinutes: number;
  transportMode: "stdio" | "http";
  httpHost: string;
  httpPort: number;
  httpMcpPath: string;
  httpSsePath: string;
  httpMessagesPath: string;
}

export const DEFAULT_CONFIG: Omit<
  Config,
  "cookieCloudEndpoint" | "cookieCloudUuid" | "cookieCloudPassword"
> = {
  logLevel: "info",
  rateLimitMs: 500,
  requestTimeoutMs: 10000,
  wbiCacheExpirationMs: 60 * 60 * 1000,
  maxCacheSize: 100,
  baseUrl: "https://api.bilibili.com",
  commentBaseUrl: "https://comment.bilibili.com",
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  referer: "https://www.bilibili.com",
  cookieCloudDomains: ["bilibili.com", ".bilibili.com", "www.bilibili.com"],
  cookieRefreshIntervalMinutes: 10,
  transportMode: "http",
  httpHost: "0.0.0.0",
  httpPort: 3000,
  httpMcpPath: "/mcp",
  httpSsePath: "/sse",
  httpMessagesPath: "/messages",
};

export const config: Config = {
  ...DEFAULT_CONFIG,
  logLevel: parseLogLevel(process.env.BILIBILI_MCP_LOG_LEVEL),
  rateLimitMs: parseIntEnv(process.env.BILIBILI_MCP_RATE_LIMIT_MS, DEFAULT_CONFIG.rateLimitMs),
  requestTimeoutMs: parseIntEnv(
    process.env.BILIBILI_MCP_REQUEST_TIMEOUT_MS,
    DEFAULT_CONFIG.requestTimeoutMs,
  ),
  maxCacheSize: parseIntEnv(process.env.BILIBILI_MCP_CACHE_SIZE, DEFAULT_CONFIG.maxCacheSize),
  userAgent: process.env.BILIBILI_MCP_USER_AGENT || process.env.USER_AGENT || DEFAULT_CONFIG.userAgent,
  cookieCloudEndpoint:
    process.env.BILIBILI_MCP_COOKIECLOUD_ENDPOINT ||
    process.env.COOKIECLOUD_ENDPOINT ||
    process.env.CC_URL ||
    "",
  cookieCloudUuid:
    process.env.BILIBILI_MCP_COOKIECLOUD_UUID ||
    process.env.COOKIECLOUD_UUID ||
    process.env.CC_ID ||
    "",
  cookieCloudPassword:
    process.env.BILIBILI_MCP_COOKIECLOUD_PASSWORD ||
    process.env.COOKIECLOUD_PASSWORD ||
    process.env.CC_PASSWORD ||
    "",
  cookieCloudDomains: parseDomains(process.env.BILIBILI_MCP_COOKIECLOUD_DOMAINS),
  cookieRefreshIntervalMinutes: parseIntEnv(
    process.env.BILIBILI_MCP_COOKIE_REFRESH_INTERVAL_MINUTES,
    DEFAULT_CONFIG.cookieRefreshIntervalMinutes,
  ),
  transportMode: process.env.BILIBILI_MCP_TRANSPORT === "stdio" ? "stdio" : "http",
  httpHost: process.env.BILIBILI_MCP_HTTP_HOST || DEFAULT_CONFIG.httpHost,
  httpPort: parseIntEnv(process.env.BILIBILI_MCP_HTTP_PORT, DEFAULT_CONFIG.httpPort),
  httpMcpPath: process.env.BILIBILI_MCP_HTTP_MCP_PATH || DEFAULT_CONFIG.httpMcpPath,
  httpSsePath: process.env.BILIBILI_MCP_HTTP_SSE_PATH || DEFAULT_CONFIG.httpSsePath,
  httpMessagesPath:
    process.env.BILIBILI_MCP_HTTP_MESSAGES_PATH || DEFAULT_CONFIG.httpMessagesPath,
};

export function validateRuntimeConfig(): void {
  const missing: string[] = [];
  if (!config.cookieCloudEndpoint) missing.push("BILIBILI_MCP_COOKIECLOUD_ENDPOINT 或 COOKIECLOUD_ENDPOINT");
  if (!config.cookieCloudUuid) missing.push("BILIBILI_MCP_COOKIECLOUD_UUID 或 COOKIECLOUD_UUID");
  if (!config.cookieCloudPassword) missing.push("BILIBILI_MCP_COOKIECLOUD_PASSWORD 或 COOKIECLOUD_PASSWORD");

  if (missing.length > 0) {
    throw new Error(`CookieCloud 配置缺失：${missing.join(", ")}。`);
  }
}

function parseIntEnv(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseLogLevel(value: string | undefined): Config["logLevel"] {
  if (value === "debug" || value === "info" || value === "warn" || value === "error" || value === "silent") {
    return value;
  }
  return DEFAULT_CONFIG.logLevel;
}

function parseDomains(value: string | undefined): string[] {
  if (!value) return [...DEFAULT_CONFIG.cookieCloudDomains];
  const domains = value.split(",").map((item) => item.trim()).filter(Boolean);
  return domains.length > 0 ? domains : [...DEFAULT_CONFIG.cookieCloudDomains];
}
