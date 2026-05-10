import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
import type { RequestContext } from "../core/types.js";

export interface VideoPageInfo {
  page: number;
  cid: number;
  part: string;
  duration?: number;
}

export async function getVideoInfo(input: { bvid?: string; aid?: number }, ctx?: RequestContext): Promise<any> {
  return request(getEndpoint("video", "info", "get_info"), input, ctx);
}

export async function getVideoDetail(input: { bvid: string }, ctx?: RequestContext): Promise<any> {
  return request(getEndpoint("video", "info", "get_detail"), { bvid: input.bvid }, ctx);
}

export async function getPlayerInfo(input: { bvid: string; cid: number }, ctx?: RequestContext): Promise<any> {
  return request(getEndpoint("video", "info", "get_player_info"), {
    bvid: input.bvid,
    cid: input.cid,
  }, ctx);
}

export async function getPlayUrl(input: { bvid: string; cid: number; qn?: number }, ctx?: RequestContext): Promise<any> {
  return request(getEndpoint("video", "info", "get_playurl"), {
    bvid: input.bvid,
    cid: input.cid,
    qn: input.qn,
  }, ctx);
}

export function normalizePages(videoData: any): VideoPageInfo[] {
  const pages = Array.isArray(videoData?.pages) ? videoData.pages : [];
  const normalized = pages
    .map((page: any, index: number) => ({
      page: Number(page?.page ?? index + 1),
      cid: Number(page?.cid ?? 0),
      part: String(page?.part ?? `P${index + 1}`),
      duration: Number(page?.duration ?? 0),
    }))
    .filter((page: VideoPageInfo) => Number.isFinite(page.cid) && page.cid > 0);

  if (normalized.length > 0) {
    return normalized;
  }

  const cid = Number(videoData?.cid ?? 0);
  return cid > 0 ? [{ page: 1, cid, part: "P1", duration: Number(videoData?.duration ?? 0) }] : [];
}

export function selectPage(videoData: any, page: number): VideoPageInfo {
  const pages = normalizePages(videoData);
  const selected = pages.find((item) => item.page === page) ?? pages[page - 1];
  if (!selected) {
    throw new Error(`当前视频共有 ${pages.length} 个分P。`);
  }
  return selected;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
