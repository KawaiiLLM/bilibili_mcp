import { access, readFile, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDecipheriv, createHash } from "node:crypto";
import { config } from "./config.js";
import { BilibiliAPIError, NetworkError } from "./errors.js";
import { logger } from "./logger.js";
import type { CookieCloudCookie, Credential } from "./types.js";

export interface CookieCloudRuntimeConfig {
  endpoint: string;
  uuid: string;
  password: string;
}

interface EnvSnapshot {
  existed: boolean;
  content: string;
}

export class CredentialManager {
  private credentials: Credential | null = null;
  private refreshPromise: Promise<Credential> | null = null;

  async initialize(): Promise<void> {
    await this.refreshCredentials(true);
  }

  async configureCookieCloud(runtimeConfig: CookieCloudRuntimeConfig): Promise<string> {
    const nextConfig = {
      endpoint: runtimeConfig.endpoint.trim(),
      uuid: runtimeConfig.uuid.trim(),
      password: runtimeConfig.password,
    };

    const previousConfig = {
      endpoint: config.cookieCloudEndpoint,
      uuid: config.cookieCloudUuid,
      password: config.cookieCloudPassword,
    };
    const previousCredentials = this.credentials;
    const envPath = resolve(process.cwd(), ".env");
    const snapshot = await readEnvSnapshot(envPath);

    let nextEnv = snapshot.content;
    nextEnv = upsertEnvValue(nextEnv, "BILIBILI_MCP_COOKIECLOUD_ENDPOINT", nextConfig.endpoint);
    nextEnv = upsertEnvValue(nextEnv, "BILIBILI_MCP_COOKIECLOUD_UUID", nextConfig.uuid);
    nextEnv = upsertEnvValue(nextEnv, "BILIBILI_MCP_COOKIECLOUD_PASSWORD", nextConfig.password);
    await writeFile(envPath, nextEnv, { encoding: "utf8", mode: 0o600 });

    try {
      applyRuntimeConfig(nextConfig);
      this.credentials = null;
      this.refreshPromise = null;
      await this.initialize();
      return envPath;
    } catch (error) {
      applyRuntimeConfig(previousConfig);
      this.credentials = previousCredentials;
      this.refreshPromise = null;
      await restoreEnvSnapshot(envPath, snapshot);
      throw error;
    }
  }

  getStatus() {
    return {
      source: "cookiecloud" as const,
      endpoint: config.cookieCloudEndpoint,
      refreshIntervalMinutes: config.cookieRefreshIntervalMinutes,
      refreshedAt: this.credentials?.refreshedAt ?? null,
      hasCredentials: Boolean(this.credentials?.cookieHeader),
    };
  }

  async refreshCredentials(force = false): Promise<Credential> {
    ensureCookieCloudConfig();
    if (!force && this.credentials && Date.now() < Number(this.credentials.refreshAt ?? 0)) {
      return this.credentials;
    }
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.fetchFromCookieCloud().finally(() => {
      this.refreshPromise = null;
    });
    this.credentials = await this.refreshPromise;
    return this.credentials;
  }

  async markAuthFailureAndRefresh(): Promise<void> {
    await this.refreshCredentials(true);
  }

  private async fetchFromCookieCloud(): Promise<Credential> {
    const endpoint = new URL(
      `get/${encodeURIComponent(config.cookieCloudUuid)}`,
      normalizeEndpoint(config.cookieCloudEndpoint),
    ).toString();

    logger.info("Fetching credentials from CookieCloud", {
      endpoint: new URL(endpoint).origin,
      domains: config.cookieCloudDomains,
    });

    let response: Response;
    try {
      response = await fetch(endpoint, { headers: { Accept: "application/json" } });
    } catch (error) {
      throw new NetworkError("无法连接 CookieCloud 服务。", error instanceof Error ? error : undefined, endpoint);
    }

    if (!response.ok) {
      throw new BilibiliAPIError(
        `CookieCloud 请求失败：HTTP ${response.status}。`,
        "COOKIECLOUD_FETCH_FAILED",
        response.status,
        undefined,
        true,
      );
    }

    const payload = await response.json();
    const encrypted = extractEncryptedPayload(payload);
    const passphrase = md5Hex(`${config.cookieCloudUuid}-${config.cookieCloudPassword}`).slice(0, 16);
    const decryptedText = decryptCryptoJSAes(encrypted, passphrase);
    const parsed = JSON.parse(decryptedText);
    const cookies = normalizeCookieEntries(parsed?.cookie_data ?? parsed).filter((cookie) =>
      matchesDomainKeyword(cookie.domain, config.cookieCloudDomains),
    );
    const cookieHeader = buildCookieHeader(cookies);
    ensureRequiredBilibiliCookies(cookieHeader);

    const now = Date.now();
    return {
      cookies,
      cookieHeader,
      refreshedAt: now,
      refreshAt: now + config.cookieRefreshIntervalMinutes * 60 * 1000,
    };
  }
}

export const credentialManager = new CredentialManager();

export function getCookieValue(credential: Credential | string | undefined, name: string): string | undefined {
  const cookieHeader = typeof credential === "string" ? credential : credential?.cookieHeader;
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...valueParts] = part.trim().split("=");
    if (rawName === name) return valueParts.join("=");
  }
  return undefined;
}

export function getBiliJct(credential: Credential | string | undefined): string | undefined {
  return getCookieValue(credential, "bili_jct");
}

export function getDedeUserId(credential: Credential | string | undefined): string | undefined {
  return getCookieValue(credential, "DedeUserID");
}

function ensureCookieCloudConfig(): void {
  const missing: string[] = [];
  if (!config.cookieCloudEndpoint) missing.push("BILIBILI_MCP_COOKIECLOUD_ENDPOINT 或 COOKIECLOUD_ENDPOINT");
  if (!config.cookieCloudUuid) missing.push("BILIBILI_MCP_COOKIECLOUD_UUID 或 COOKIECLOUD_UUID");
  if (!config.cookieCloudPassword) missing.push("BILIBILI_MCP_COOKIECLOUD_PASSWORD 或 COOKIECLOUD_PASSWORD");
  if (missing.length > 0) {
    throw new BilibiliAPIError(
      `CookieCloud 配置缺失：${missing.join(", ")}。`,
      "COOKIECLOUD_CONFIG_INVALID",
      undefined,
      undefined,
      false,
      "请设置 CookieCloud endpoint、UUID 和密码，或调用 bilibili_config action=setup。",
    );
  }
}

function md5Hex(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

function decryptCryptoJSAes(encrypted: string, passphrase: string): string {
  const raw = Buffer.from(encrypted, "base64");
  if (raw.subarray(0, 8).toString("utf8") !== "Salted__") {
    throw new Error("CookieCloud 密文格式不正确。");
  }
  const salt = raw.subarray(8, 16);
  const ciphertext = raw.subarray(16);
  const { key, iv } = evpBytesToKey(Buffer.from(passphrase, "utf8"), salt, 32, 16);
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function evpBytesToKey(password: Buffer, salt: Buffer, keyLen: number, ivLen: number) {
  const buffers: Buffer[] = [];
  let previous = Buffer.alloc(0);
  while (Buffer.concat(buffers).length < keyLen + ivLen) {
    const hash = createHash("md5");
    hash.update(previous);
    hash.update(password);
    hash.update(salt);
    previous = hash.digest();
    buffers.push(previous);
  }
  const material = Buffer.concat(buffers);
  return { key: material.subarray(0, keyLen), iv: material.subarray(keyLen, keyLen + ivLen) };
}

function extractEncryptedPayload(payload: any): string {
  if (typeof payload?.encrypted === "string") return payload.encrypted;
  if (typeof payload?.data?.encrypted === "string") return payload.data.encrypted;
  if (typeof payload === "string") return payload;
  throw new BilibiliAPIError("CookieCloud 返回内容中缺少 encrypted 字段。", "COOKIECLOUD_FETCH_FAILED", undefined, payload, true);
}

function normalizeCookieEntries(raw: unknown): CookieCloudCookie[] {
  if (Array.isArray(raw)) return raw.filter(Boolean) as CookieCloudCookie[];
  if (raw && typeof raw === "object") {
    return Object.values(raw as Record<string, unknown>).flatMap((value) => normalizeCookieEntries(value));
  }
  return [];
}

function matchesDomainKeyword(domain: string | undefined, keywords: string[]): boolean {
  const normalized = (domain || "").toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function buildCookieHeader(cookies: CookieCloudCookie[]): string {
  const deduped = new Map<string, string>();
  for (const cookie of cookies) {
    if (cookie.name && typeof cookie.value === "string") {
      deduped.set(cookie.name, cookie.value);
    }
  }
  return [...deduped.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

function ensureRequiredBilibiliCookies(header: string): void {
  const missing = ["SESSDATA=", "bili_jct=", "DedeUserID="].filter((needle) => !header.includes(needle));
  if (missing.length > 0) {
    throw new BilibiliAPIError(`CookieCloud 返回的 B 站 Cookie 不完整，缺少 ${missing.join(", ")}。`, "BILIBILI_COOKIE_INVALID");
  }
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
}

function serializeEnvValue(value: string): string {
  return /^[A-Za-z0-9_./:-]+$/.test(value) ? value : JSON.stringify(value);
}

function upsertEnvValue(content: string, key: string, value: string): string {
  const line = `${key}=${serializeEnvValue(value)}`;
  const pattern = new RegExp(`^(\\s*(?:export\\s+)?${key}\\s*=).*$`, "m");
  if (pattern.test(content)) return content.replace(pattern, line);
  return `${content}${content.length > 0 && !content.endsWith("\n") ? "\n" : ""}${line}\n`;
}

async function readEnvSnapshot(envPath: string): Promise<EnvSnapshot> {
  try {
    await access(envPath);
    return { existed: true, content: await readFile(envPath, "utf8") };
  } catch {
    return { existed: false, content: "" };
  }
}

async function restoreEnvSnapshot(envPath: string, snapshot: EnvSnapshot): Promise<void> {
  if (!snapshot.existed) {
    await unlink(envPath).catch(() => undefined);
    return;
  }
  await writeFile(envPath, snapshot.content, "utf8");
}

function applyRuntimeConfig(next: CookieCloudRuntimeConfig): void {
  config.cookieCloudEndpoint = next.endpoint;
  config.cookieCloudUuid = next.uuid;
  config.cookieCloudPassword = next.password;
  process.env.BILIBILI_MCP_COOKIECLOUD_ENDPOINT = next.endpoint;
  process.env.BILIBILI_MCP_COOKIECLOUD_UUID = next.uuid;
  process.env.BILIBILI_MCP_COOKIECLOUD_PASSWORD = next.password;
}
