import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
import { normalizeAbsoluteUrl } from "../tools/normalize.js";
import { formatDuration } from "./video.js";
import type { RequestContext } from "../core/types.js";

export async function getHotVideos(input: { page?: number; pageSize?: number } = {}, ctx?: RequestContext): Promise<any> {
  return request(getEndpoint("ranking", "popular", "hot"), {
    pn: input.page ?? 1,
    ps: input.pageSize ?? 20,
  }, ctx);
}

export async function getRanking(input: { rid?: number; type?: string } = {}, ctx?: RequestContext): Promise<any> {
  return request(getEndpoint("ranking", "popular", "ranking"), {
    rid: input.rid ?? 0,
    type: input.type ?? "all",
  }, ctx);
}

export async function getWeeklySeries(ctx?: RequestContext): Promise<any> {
  return request(getEndpoint("ranking", "popular", "weekly"), {}, ctx);
}

export async function getMustWatch(ctx?: RequestContext): Promise<any> {
  return request(getEndpoint("ranking", "popular", "must_watch"), {}, ctx);
}

export interface HomeRecommendItem {
  bvid: string;
  aid: number;
  cid: number;
  title: string;
  cover: string;
  duration_seconds: number;
  duration_text: string;
  owner: { mid: number; name: string; avatar: string };
  stat: { view: number; danmaku: number; like: number };
  publish_time: number;
  is_followed: boolean;
  reason: string | null;
}

export interface HomeRecommendResult {
  items: HomeRecommendItem[];
}

export async function getHomeRecommend(input: { limit?: number } = {}, ctx?: RequestContext): Promise<HomeRecommendResult> {
  const limit = clampLimit(input.limit ?? 20, 1, 30);
  const payload = await request<any>(getEndpoint("ranking", "popular", "recommend"), {
    ps: limit,
    fresh_idx: 1,
    fresh_idx_1h: 1,
    brush: 1,
    fetch_row: 1,
    homepage_ver: 1,
    feed_version: "V8",
  }, ctx);
  const rawItems: any[] = Array.isArray(payload?.item) ? payload.item : [];
  const items = rawItems
    .filter((entry) => entry?.goto === "av" && !entry?.business_info)
    .map(mapHomeItem);
  return { items };
}

function mapHomeItem(raw: any): HomeRecommendItem {
  const duration = Number(raw?.duraion ?? raw?.duration ?? 0);
  const owner = raw?.owner ?? {};
  const stat = raw?.stat ?? {};
  return {
    bvid: String(raw?.bvid ?? ""),
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

function mapRcmdReason(reason: any): string | null {
  if (!reason || typeof reason !== "object") return null;
  const type = Number(reason.reason_type ?? 0);
  if (type === 0) return null;
  if (type === 1) return "已关注";
  if (type === 3) return "高点赞";
  const content = typeof reason.content === "string" ? reason.content.trim() : "";
  return content || null;
}

function clampLimit(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const floored = Math.floor(value);
  if (floored < min) return min;
  if (floored > max) return max;
  return floored;
}
