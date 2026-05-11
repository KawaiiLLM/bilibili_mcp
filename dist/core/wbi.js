import { createHash } from "node:crypto";
import { BASE_URLS, DEFAULT_HEADERS } from "./constants.js";
import { config } from "./config.js";
import { BilibiliAPIError, NetworkError } from "./errors.js";
import { fetchWithTimeout } from "./fetch.js";
import { withRetry } from "./retry.js";
const MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52,
];
let cachedWbi = null;
const DM_RAND_CHARSET = "ABCDEFGHIJK";
const DEFAULT_WEB_LOCATION = 1550101;
function pickRandomDmToken() {
    const pool = DM_RAND_CHARSET.split("");
    const first = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const second = pool[Math.floor(Math.random() * pool.length)];
    return `${first}${second}`;
}
export function addWbi2Params(params) {
    return {
        ...params,
        dm_img_list: "[]",
        dm_img_str: pickRandomDmToken(),
        dm_cover_img_str: pickRandomDmToken(),
        dm_img_inter: JSON.stringify({ ds: [], wh: [0, 0, 0], of: [0, 0, 0] }),
    };
}
export async function withWbiSignature(params, signal) {
    const { mixKey } = await getWbiKeys(signal);
    const signed = { ...params, wts: Math.floor(Date.now() / 1000) };
    if (signed.web_location === undefined)
        signed.web_location = DEFAULT_WEB_LOCATION;
    return { ...signed, w_rid: generateWbiRid(signed, mixKey) };
}
export function clearWbiCache() {
    cachedWbi = null;
}
async function getWbiKeys(signal) {
    const now = Date.now();
    if (cachedWbi && cachedWbi.expireAt > now) {
        return { mixKey: cachedWbi.mixKey };
    }
    const url = new URL("/x/web-interface/nav", BASE_URLS.api);
    const response = await withRetry(() => fetchWithTimeout(url, {
        headers: { ...DEFAULT_HEADERS, Accept: "application/json" },
        signal,
    }));
    if (!response.ok) {
        throw new NetworkError(`HTTP ${response.status}: ${response.statusText}`, undefined, url.toString(), response.status);
    }
    const payload = await response.json();
    const imgKey = extractKey(payload?.data?.wbi_img?.img_url);
    const subKey = extractKey(payload?.data?.wbi_img?.sub_url);
    if (!imgKey || !subKey) {
        throw new BilibiliAPIError("无法获取 WBI 签名参数。", "WBI_DATA_MISSING", undefined, payload, true);
    }
    cachedWbi = {
        mixKey: getMixinKey(imgKey, subKey),
        expireAt: now + config.wbiCacheExpirationMs,
    };
    return { mixKey: cachedWbi.mixKey };
}
function getMixinKey(imgKey, subKey) {
    const raw = imgKey + subKey;
    return MIXIN_KEY_ENC_TAB.map((index) => raw[index]).join("").slice(0, 32);
}
function extractKey(url) {
    return typeof url === "string" ? url.match(/([^/_]+)(?=\.[a-zA-Z]+$)/)?.[0] : undefined;
}
function generateWbiRid(params, mixKey) {
    const query = Object.entries(params)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value).replace(/[!'()*]/g, ""))}`)
        .join("&");
    return createHash("md5").update(query + mixKey).digest("hex");
}
//# sourceMappingURL=wbi.js.map