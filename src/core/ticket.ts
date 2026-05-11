import { createHmac } from "node:crypto";
import { DEFAULT_HEADERS } from "./constants.js";
import { fetchWithTimeout } from "./fetch.js";
import { logger } from "./logger.js";

const HMAC_SECRET = "XgwSnGZ1p";
const TICKET_URL = "https://api.bilibili.com/bapis/bilibili.api.ticket.v1.Ticket/GenWebTicket";

interface CachedTicket {
  value: string;
  expireAt: number;
}

let cached: CachedTicket | null = null;
let inFlight: Promise<CachedTicket | undefined> | null = null;

function hmacSha256(key: string, message: string): string {
  return createHmac("sha256", key).update(message).digest("hex");
}

export const _hmacSha256ForTest = hmacSha256;

export function clearTicketCache(): void {
  cached = null;
  inFlight = null;
}

export function getBiliTicketCached(): Readonly<CachedTicket> | null {
  return cached;
}

export interface GetBiliTicketOptions {
  signal?: AbortSignal;
  cookieHeader?: string;
}

export async function getBiliTicket(
  opts?: GetBiliTicketOptions,
): Promise<string | undefined> {
  const now = Date.now();
  if (cached && now < cached.expireAt) return cached.value;
  if (inFlight) {
    const pending = await inFlight;
    return pending?.value;
  }
  inFlight = fetchTicket(opts).finally(() => {
    inFlight = null;
  });
  const fetched = await inFlight;
  if (!fetched) return undefined;
  cached = fetched;
  return fetched.value;
}

async function fetchTicket(opts?: GetBiliTicketOptions): Promise<CachedTicket | undefined> {
  const ts = Math.floor(Date.now() / 1000);
  const hexsign = hmacSha256(HMAC_SECRET, `ts${ts}`);
  const url = new URL(TICKET_URL);
  url.searchParams.set("key_id", "ec02");
  url.searchParams.set("hexsign", hexsign);
  url.searchParams.set("context[ts]", String(ts));
  url.searchParams.set("csrf", "");
  const headers: Record<string, string> = { ...DEFAULT_HEADERS };
  if (opts?.cookieHeader) headers.Cookie = opts.cookieHeader;
  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers,
      signal: opts?.signal,
    });
    if (!response.ok) {
      logger.warn("bili_ticket fetch failed", { status: response.status });
      return undefined;
    }
    const payload = (await response.json()) as { code?: number; data?: { ticket?: string } };
    if (payload?.code !== 0 || typeof payload?.data?.ticket !== "string") {
      logger.warn("bili_ticket response invalid", { code: payload?.code });
      return undefined;
    }
    return {
      value: payload.data.ticket,
      expireAt: Date.now() + 3 * 24 * 60 * 60 * 1000,
    };
  } catch (err) {
    logger.warn("bili_ticket fetch threw", { err: err instanceof Error ? err.message : err });
    return undefined;
  }
}
