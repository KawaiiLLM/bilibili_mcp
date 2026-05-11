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

function hmacSha256(key: string, message: string): string {
  return createHmac("sha256", key).update(message).digest("hex");
}

export const _hmacSha256ForTest = hmacSha256;

export function clearTicketCache(): void {
  cached = null;
}

export async function getBiliTicket(signal?: AbortSignal): Promise<string | undefined> {
  const fetched = await fetchTicket(signal);
  if (!fetched) return undefined;
  cached = fetched;
  return fetched.value;
}

async function fetchTicket(signal?: AbortSignal): Promise<CachedTicket | undefined> {
  const ts = Math.floor(Date.now() / 1000);
  const hexsign = hmacSha256(HMAC_SECRET, `ts${ts}`);
  const url = new URL(TICKET_URL);
  url.searchParams.set("key_id", "ec02");
  url.searchParams.set("hexsign", hexsign);
  url.searchParams.set("context[ts]", String(ts));
  url.searchParams.set("csrf", "");
  try {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: DEFAULT_HEADERS,
      signal,
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
