import { BASE_URLS, DEFAULT_HEADERS } from "./constants.js";
import { config } from "./config.js";
import { fetchWithTimeout } from "./fetch.js";
import { buildActivationPayload, genUuidInfoc, murmur3x64_128 } from "./fingerprint.js";
import { logger } from "./logger.js";
import { appendCookieFragment } from "./cookies.js";
let cached;
let inFlight = null;
let pendingActivation = null;
export async function getBuvidCookies(signal) {
    if (cached)
        return cached.cookieHeader;
    if (inFlight) {
        const pending = await inFlight;
        return pending?.cookieHeader;
    }
    inFlight = fetchBuvid(signal).finally(() => {
        inFlight = null;
    });
    const bundle = await inFlight;
    if (!bundle)
        return undefined;
    cached = bundle;
    return bundle.cookieHeader;
}
export function appendBuvidCookies(cookieHeader, buvid) {
    return appendCookieFragment(cookieHeader, buvid);
}
export function clearBuvidCache() {
    cached = undefined;
    inFlight = null;
    pendingActivation = null;
}
export async function _awaitBuvidActivationForTest() {
    if (pendingActivation)
        await pendingActivation;
}
async function fetchBuvid(signal) {
    try {
        const response = await fetchWithTimeout(new URL("/x/frontend/finger/spi", BASE_URLS.api), {
            headers: { ...DEFAULT_HEADERS },
            signal,
        });
        if (!response.ok) {
            logger.warn("buvid SPI HTTP failed", { status: response.status });
            return undefined;
        }
        const payload = (await response.json());
        if (payload?.code !== 0) {
            logger.warn("buvid SPI returned non-zero code", { code: payload?.code });
            return undefined;
        }
        const buvid3 = payload?.data?.b_3;
        const buvid4 = payload?.data?.b_4;
        if (typeof buvid3 !== "string" || typeof buvid4 !== "string")
            return undefined;
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
    }
    catch (err) {
        logger.warn("buvid SPI fetch threw", { err: err instanceof Error ? err.message : err });
        return undefined;
    }
}
async function activateBuvid(params) {
    try {
        const response = await fetchWithTimeout(new URL("/x/internal/gaia-gateway/ExClimbWuzhi", BASE_URLS.api), {
            method: "POST",
            headers: {
                ...DEFAULT_HEADERS,
                "Content-Type": "application/json",
                Cookie: params.cookieHeader,
            },
            body: params.payloadString,
            signal: params.signal,
        });
        if (!response.ok) {
            logger.warn("buvid activation failed", { status: response.status });
            return;
        }
        const data = (await response.json());
        if (data?.code !== 0) {
            logger.warn("buvid activation returned non-zero code", { code: data?.code, msg: data?.msg });
        }
    }
    catch (err) {
        logger.warn("buvid activation threw", { err: err instanceof Error ? err.message : err });
    }
}
//# sourceMappingURL=buvid.js.map