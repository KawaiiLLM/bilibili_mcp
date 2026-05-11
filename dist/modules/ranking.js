import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
import { normalizeAbsoluteUrl } from "../tools/normalize.js";
import { formatDuration } from "./video.js";
export async function getHotVideos(input = {}, ctx) {
    return request(getEndpoint("ranking", "popular", "hot"), {
        pn: input.page ?? 1,
        ps: input.pageSize ?? 20,
    }, ctx);
}
export async function getRanking(input = {}, ctx) {
    return request(getEndpoint("ranking", "popular", "ranking"), {
        rid: input.rid ?? 0,
        type: input.type ?? "all",
    }, ctx);
}
export async function getWeeklySeries(ctx) {
    return request(getEndpoint("ranking", "popular", "weekly"), {}, ctx);
}
export async function getMustWatch(ctx) {
    return request(getEndpoint("ranking", "popular", "must_watch"), {}, ctx);
}
export async function getHomeRecommend(input = {}, ctx) {
    const limit = clampLimit(input.limit ?? 20, 1, 30);
    const payload = await request(getEndpoint("ranking", "popular", "recommend"), {
        ps: limit,
        fresh_idx: 1,
        fresh_idx_1h: 1,
        brush: 1,
        fetch_row: 1,
        homepage_ver: 1,
        feed_version: "V8",
    }, ctx);
    const rawItems = Array.isArray(payload?.item) ? payload.item : [];
    const items = rawItems
        .filter((entry) => entry?.goto === "av" && !entry?.business_info)
        .map(mapHomeItem);
    return { items };
}
function mapHomeItem(raw) {
    const duration = Number(raw?.duraion ?? raw?.duration ?? 0);
    const owner = raw?.owner ?? {};
    const stat = raw?.stat ?? {};
    const bvid = String(raw?.bvid ?? "");
    return {
        bvid,
        url: bvid ? `https://www.bilibili.com/video/${bvid}` : "",
        aid: Number(raw?.id ?? raw?.aid ?? 0),
        cid: Number(raw?.cid ?? 0),
        title: String(raw?.title ?? ""),
        cover: normalizeAbsoluteUrl(raw?.pic),
        duration_seconds: duration,
        duration_text: formatDuration(duration),
        owner: {
            mid: Number(owner?.mid ?? 0),
            name: String(owner?.name ?? ""),
            avatar: normalizeAbsoluteUrl(owner?.face),
        },
        stat: {
            view: Number(stat?.view ?? 0),
            danmaku: Number(stat?.danmaku ?? 0),
            like: Number(stat?.like ?? 0),
        },
        publish_time: Number(raw?.pubdate ?? 0),
        is_followed: Boolean(raw?.is_followed),
        reason: mapRcmdReason(raw?.rcmd_reason),
    };
}
function mapRcmdReason(reason) {
    if (!reason || typeof reason !== "object")
        return null;
    const type = Number(reason.reason_type ?? 0);
    if (type === 0)
        return null;
    if (type === 1)
        return "已关注";
    if (type === 3)
        return "高点赞";
    const content = typeof reason.content === "string" ? reason.content.trim() : "";
    return content || null;
}
function clampLimit(value, min, max) {
    if (!Number.isFinite(value))
        return min;
    const floored = Math.floor(value);
    if (floored < min)
        return min;
    if (floored > max)
        return max;
    return floored;
}
//# sourceMappingURL=ranking.js.map