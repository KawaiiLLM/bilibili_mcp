import { BASE_URLS, DEFAULT_HEADERS } from "./constants.js";
import { config } from "./config.js";
import { fetchWithTimeout } from "./fetch.js";
import { buildActivationPayload, genUuidInfoc, murmur3x64_128 } from "./fingerprint.js";
import { logger } from "./logger.js";
import { appendCookieFragment } from "./cookies.js";

interface BuvidBundle {
  cookieHeader: string;
}

let cached: BuvidBundle | undefined;
let inFlight: Promise<BuvidBundle | undefined> | null = null;
let pendingActivation: Promise<void> | null = null;

export async function getBuvidCookies(signal?: AbortSignal): Promise<string | undefined> {
  if (cached) return cached.cookieHeader;
  if (inFlight) {
    const pending = await inFlight;
    return pending?.cookieHeader;
  }
  inFlight = fetchBuvid(signal).finally(() => {
    inFlight = null;
  });
  const bundle = await inFlight;
  if (!bundle) return undefined;
  cached = bundle;
  return bundle.cookieHeader;
}

export function appendBuvidCookies(cookieHeader: string | undefined, buvid: string): string {
  return appendCookieFragment(cookieHeader, buvid);
}

export function clearBuvidCache(): void {
  cached = undefined;
  inFlight = null;
  pendingActivation = null;
}

export async function _awaitBuvidActivationForTest(): Promise<void> {
  if (pendingActivation) await pendingActivation;
}

async function fetchBuvid(signal?: AbortSignal): Promise<BuvidBundle | undefined> {
  try {
    const response = await fetchWithTimeout(new URL("/x/frontend/finger/spi", BASE_URLS.api), {
      headers: { ...DEFAULT_HEADERS },
      signal,
    });
    if (!response.ok) {
      logger.warn("buvid SPI HTTP failed", { status: response.status });
      return undefined;
    }
    const payload = (await response.json()) as { code?: number; data?: { b_3?: string; b_4?: string } };
    if (payload?.code !== 0) {
      logger.warn("buvid SPI returned non-zero code", { code: payload?.code });
      return undefined;
    }
    const buvid3 = payload?.data?.b_3;
    const buvid4 = payload?.data?.b_4;
    if (typeof buvid3 !== "string" || typeof buvid4 !== "string") return undefined;

    const uuid = genUuidInfoc();
    const payloadString = buildActivationPayload(uuid);
    const buvidFp = murmur3x64_128(payloadString, 31);

    const cookieHeader = [
      `buvid3=${buvid3}`,
      `buvid4=${buvid4}`,
      `buvid_fp=${buvidFp}`,
      `_uuid=${uuid}`,
    ].join("; ");

    if (config.enableBuvidActivation) {
      // Fire-and-forget: cookie is already complete; activation is server-side
      // device registration. Awaiting would block the first business request on
      // ExClimbWuzhi latency for no client-side benefit.
      pendingActivation = activateBuvid({ cookieHeader, payloadString, signal }).finally(() => {
        pendingActivation = null;
      });
    }

    return { cookieHeader };
  } catch (err) {
    logger.warn("buvid SPI fetch threw", { err: err instanceof Error ? err.message : err });
    return undefined;
  }
}

async function activateBuvid(params: {
  cookieHeader: string;
  payloadString: string;
  signal?: AbortSignal;
}): Promise<void> {
  try {
    const response = await fetchWithTimeout(
      new URL("/x/internal/gaia-gateway/ExClimbWuzhi", BASE_URLS.api),
      {
        method: "POST",
        headers: {
          ...DEFAULT_HEADERS,
          "Content-Type": "application/json",
          Cookie: params.cookieHeader,
        },
        body: params.payloadString,
        signal: params.signal,
      },
    );
    if (!response.ok) {
      logger.warn("buvid activation failed", { status: response.status });
      return;
    }
    const data = (await response.json()) as { code?: number; msg?: string };
    if (data?.code !== 0) {
      logger.warn("buvid activation returned non-zero code", { code: data?.code, msg: data?.msg });
    }
  } catch (err) {
    logger.warn("buvid activation threw", { err: err instanceof Error ? err.message : err });
  }
}
