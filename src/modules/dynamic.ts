import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
import { normalizeAbsoluteUrl } from "../tools/normalize.js";
import type { RequestContext } from "../core/types.js";

export interface FollowingVideoItem {
  bvid: string;
  aid: number;
  title: string;
  cover: string;
  duration_text: string;
  desc: string;
  jump_url: string;
  stat: { view: number; danmaku: number };
  publish_time: number;
  publish_text: string;
  author: { mid: number; name: string; avatar: string };
  dynamic_id: string;
}

export interface FollowingVideosResult {
  items: FollowingVideoItem[];
  cursor: string | null;
  has_more: boolean;
  update_baseline: string | null;
}

const ARCHIVE_DYNAMIC_TYPES = new Set(["DYNAMIC_TYPE_AV", "DYNAMIC_TYPE_UGC_SEASON"]);
const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 30;

export async function getFollowingVideos(
  input: { cursor?: string; limit?: number } = {},
  ctx?: RequestContext,
): Promise<FollowingVideosResult> {
  const limit = clampLimit(input.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
  const payload = await request<any>(getEndpoint("dynamic", "feed", "all"), {
    type: "video",
    offset: input.cursor ?? "",
  }, ctx);

  const rawItems: any[] = Array.isArray(payload?.items) ? payload.items : [];
  const mapped: FollowingVideoItem[] = [];
  for (const raw of rawItems) {
    if (mapped.length >= limit) break;
    if (!ARCHIVE_DYNAMIC_TYPES.has(raw?.type)) continue;
    const archive = raw?.modules?.module_dynamic?.major?.archive;
    const major = raw?.modules?.module_dynamic?.major;
    if (!archive || major?.type !== "MAJOR_TYPE_ARCHIVE") continue;
    const author = raw?.modules?.module_author ?? {};
    mapped.push({
      bvid: String(archive.bvid ?? ""),
      aid: Number(archive.aid ?? 0),
      title: String(archive.title ?? ""),
      cover: normalizeAbsoluteUrl(archive.cover),
      duration_text: String(archive.duration_text ?? ""),
      desc: String(archive.desc ?? ""),
      jump_url: normalizeAbsoluteUrl(archive.jump_url),
      stat: {
        view: Number(archive?.stat?.play ?? 0),
        danmaku: Number(archive?.stat?.danmaku ?? 0),
      },
      publish_time: Number(author.pub_ts ?? 0),
      publish_text: String(author.pub_time ?? ""),
      author: {
        mid: Number(author.mid ?? 0),
        name: String(author.name ?? ""),
        avatar: normalizeAbsoluteUrl(author.face),
      },
      dynamic_id: String(raw?.id_str ?? ""),
    });
  }

  const rawOffset = typeof payload?.offset === "string" ? payload.offset : "";
  const rawBaseline = typeof payload?.update_baseline === "string" ? payload.update_baseline : "";
  return {
    items: mapped,
    cursor: rawOffset ? rawOffset : null,
    has_more: Boolean(payload?.has_more),
    update_baseline: rawBaseline ? rawBaseline : null,
  };
}

function clampLimit(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const floored = Math.floor(value);
  if (floored < min) return min;
  if (floored > max) return max;
  return floored;
}
