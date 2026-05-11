import { config } from "./config.js";
import { BilibiliAPIError, NetworkError, TimeoutError } from "./errors.js";
const BV_PATTERN = /BV[A-Za-z0-9]{10}/;
const AID_PATTERN = /(?:^|\/|av)(\d{1,})/i;
const URL_PATTERN = /https?:\/\/[^\s<>"']+|(?:b23\.tv|bili2233\.cn)\/[^\s<>"']+/i;
const SHORT_HOSTS = new Set(["b23.tv", "bili2233.cn"]);
const VIDEO_HOSTS = new Set(["bilibili.com", "www.bilibili.com", "m.bilibili.com"]);
export function extractBVId(input) {
    const match = input.match(BV_PATTERN);
    if (!match)
        throw new Error("Invalid Bilibili video ID or URL");
    return match[0];
}
export function containsBVId(input) {
    return BV_PATTERN.test(input);
}
export function extractAid(input) {
    const match = input.match(AID_PATTERN);
    const aid = match ? Number(match[1]) : Number.NaN;
    if (!Number.isFinite(aid) || aid <= 0)
        throw new Error("Invalid Bilibili AV ID or URL");
    return Math.floor(aid);
}
export function containsAid(input) {
    return AID_PATTERN.test(input);
}
export function isValidBVId(input) {
    return /^BV[A-Za-z0-9]{10}$/.test(input);
}
export function isValidAid(input) {
    return /^(?:av)?\d+$/i.test(input.trim()) && Number(input.trim().replace(/^av/i, "")) > 0;
}
export async function resolveBilibiliVideoInput(input) {
    const cleaned = input.trim();
    if (!cleaned)
        throw new Error("Input cannot be empty");
    if (containsBVId(cleaned))
        return cleaned;
    const url = extractUrlCandidate(cleaned);
    if (!url)
        return cleaned;
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        return cleaned;
    }
    const host = parsed.hostname.toLowerCase();
    if (!SHORT_HOSTS.has(host) && !VIDEO_HOSTS.has(host))
        return cleaned;
    if (!SHORT_HOSTS.has(host))
        return url;
    const redirected = await fetchRedirectedUrl(url);
    if (containsBVId(redirected))
        return redirected;
    throw new BilibiliAPIError("B 站短链接没有解析到视频 BV 地址。", "VIDEO_LINK_RESOLVE_FAILED", undefined, { input, redirected }, true);
}
function extractUrlCandidate(input) {
    const match = input.match(URL_PATTERN);
    if (!match)
        return null;
    const candidate = match[0].replace(/[)\]}>，。！？、]+$/u, "");
    return /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
}
async function fetchRedirectedUrl(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    try {
        const response = await fetch(url, {
            method: "GET",
            redirect: "follow",
            signal: controller.signal,
            headers: {
                "User-Agent": config.userAgent,
                Referer: config.referer,
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        });
        if (!response.ok && response.status >= 400) {
            throw new NetworkError(`短链接请求失败：HTTP ${response.status}`, undefined, url, response.status);
        }
        return response.url || url;
    }
    catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            throw new TimeoutError("短链接解析超时。", config.requestTimeoutMs);
        }
        if (error instanceof NetworkError || error instanceof TimeoutError)
            throw error;
        throw new NetworkError("短链接请求失败。", error instanceof Error ? error : undefined, url);
    }
    finally {
        clearTimeout(timeout);
    }
}
//# sourceMappingURL=bvid.js.map