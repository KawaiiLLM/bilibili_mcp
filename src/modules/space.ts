import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
import { normalizeAbsoluteUrl } from "../tools/normalize.js";
import type { RequestContext } from "../core/types.js";

export type SpaceOrder = "pubdate" | "click" | "stow";

export interface SpaceVideoMeta {
  id: number;
  title: string;
  intro: string;
}

export interface SpaceVideoItem {
  bvid: string;
  url: string;
  aid: number;
  title: string;
  cover: string;
  duration_text: string;
  description: string;
  publish_time: number;
  stat: { view: number; danmaku: number; comment: number };
  category: { tid: number; name: string };
  is_union_video: boolean;
  is_live_playback: boolean;
  season_id: number | null;
  meta: SpaceVideoMeta | null;
}

export interface SpaceVideoCategory {
  tid: number;
  name: string;
  count: number;
}

export interface SpaceVideosResult {
  mid: number;
  items: SpaceVideoItem[];
  page: { current: number; size: number; total: number };
  categories: SpaceVideoCategory[];
}

export async function getSpaceVideos(
  input: { mid: number; order?: SpaceOrder; keyword?: string; page?: number; limit?: number },
  ctx?: RequestContext,
): Promise<SpaceVideosResult> {
  const ps = clampSpaceLimit(input.limit);
  const pn = Math.max(1, Math.floor(input.page ?? 1));
  const params: Record<string, string | number> = {
    mid: input.mid,
    order: input.order ?? "pubdate",
    pn,
    ps,
  };
  if (input.keyword && input.keyword.trim().length > 0) {
    params.keyword = input.keyword.trim();
  }
  const payload = await request<any>(getEndpoint("space", "wbi", "arc_search"), params, ctx);
  const tlist = payload?.list?.tlist ?? {};
  const tlistEntries = Object.values(tlist) as Array<{ tid: number; name: string; count: number }>;
  const tidToName = new Map<number, string>(tlistEntries.map((entry) => [Number(entry?.tid ?? 0), String(entry?.name ?? "")]));
  const rawItems: any[] = Array.isArray(payload?.list?.vlist) ? payload.list.vlist : [];
  const items = rawItems.map((raw) => mapSpaceVideo(raw, tidToName));
  const categories: SpaceVideoCategory[] = tlistEntries
    .map((entry) => ({ tid: Number(entry?.tid ?? 0), name: String(entry?.name ?? ""), count: Number(entry?.count ?? 0) }))
    .filter((entry) => entry.tid > 0);
  const page = payload?.page ?? {};
  return {
    mid: Number(input.mid),
    items,
    page: { current: Number(page.pn ?? pn), size: Number(page.ps ?? ps), total: Number(page.count ?? items.length) },
    categories,
  };
}

function clampSpaceLimit(limit: number | undefined): number {
  const value = Math.floor(limit ?? 30);
  if (!Number.isFinite(value) || value <= 0) return 30;
  return Math.min(50, value);
}

function mapSpaceVideo(raw: any, tidToName: Map<number, string>): SpaceVideoItem {
  const tid = Number(raw?.typeid ?? 0);
  const bvid = String(raw?.bvid ?? "");
  const seasonId = Number(raw?.season_id ?? 0);
  const metaRaw = raw?.meta;
  return {
    bvid,
    url: bvid ? `https://www.bilibili.com/video/${bvid}` : "",
    aid: Number(raw?.aid ?? 0),
    title: String(raw?.title ?? ""),
    cover: normalizeAbsoluteUrl(raw?.pic),
    duration_text: String(raw?.length ?? ""),
    description: String(raw?.description ?? ""),
    publish_time: Number(raw?.created ?? 0),
    stat: {
      view: Number(raw?.play ?? 0),
      danmaku: Number(raw?.video_review ?? 0),
      comment: Number(raw?.comment ?? 0),
    },
    category: { tid, name: tidToName.get(tid) ?? "" },
    is_union_video: Boolean(raw?.is_union_video),
    is_live_playback: Boolean(raw?.is_live_playback),
    season_id: seasonId > 0 ? seasonId : null,
    meta: metaRaw
      ? { id: Number(metaRaw.id ?? 0), title: String(metaRaw.title ?? ""), intro: String(metaRaw.intro ?? "") }
      : null,
  };
}
