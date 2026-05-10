import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
import type { RequestContext } from "../core/types.js";

export function stripHtml(value: string | undefined): string {
  return String(value ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export function normalizeSearchItem(item: any): any {
  const bvid = item?.bvid;
  return {
    title: stripHtml(item?.title),
    bvid,
    url: bvid ? `https://www.bilibili.com/video/${bvid}` : item?.arcurl,
    author: item?.author ?? item?.owner?.name,
    play_count: toNumber(item?.play ?? item?.stat?.view),
    duration: item?.duration,
    publish_time: toNumber(item?.pubdate ?? item?.ctime),
    description: stripHtml(item?.description),
  };
}

export async function searchVideos(input: { keyword: string; page?: number; pageSize?: number }, ctx?: RequestContext): Promise<any> {
  const payload = await request<any>(getEndpoint("search", "search", "web_search_by_type"), {
    search_type: "video",
    keyword: input.keyword,
    page: input.page ?? 1,
    page_size: input.pageSize ?? 10,
  }, ctx);
  return { raw: payload, results: Array.isArray(payload?.result) ? payload.result.map(normalizeSearchItem) : [] };
}

export async function searchAll(input: { keyword: string; page?: number }, ctx?: RequestContext): Promise<any> {
  return request(getEndpoint("search", "search", "web_search"), {
    keyword: input.keyword,
    page: input.page ?? 1,
  }, ctx);
}

export async function searchByType(input: { keyword: string; searchType?: string; page?: number; pageSize?: number }, ctx?: RequestContext): Promise<any> {
  if (!input.searchType || input.searchType === "video") {
    return searchVideos({ keyword: input.keyword, page: input.page, pageSize: input.pageSize }, ctx);
  }
  return request(getEndpoint("search", "search", "web_search_by_type"), {
    search_type: input.searchType,
    keyword: input.keyword,
    page: input.page ?? 1,
    page_size: input.pageSize ?? 10,
  }, ctx);
}

export async function getHotSearchKeywords(ctx?: RequestContext): Promise<any> {
  const payload = await request<any>(getEndpoint("search", "search", "hotword"), {}, ctx);
  return { list: Array.isArray(payload?.list) ? payload.list : [] };
}

export async function getSearchSuggestions(input: { keyword: string }, ctx?: RequestContext): Promise<any> {
  const payload = await request<any>(getEndpoint("search", "search", "suggest"), { term: input.keyword }, ctx);
  return normalizeSuggestions(payload);
}

function toNumber(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeSuggestions(payload: any): string[] {
  const candidates = Array.isArray(payload?.result?.tag)
    ? payload.result.tag
    : Array.isArray(payload?.tag)
      ? payload.tag
      : Array.isArray(payload)
        ? payload
        : [];
  const values = candidates.map((item: any) => {
    if (typeof item === "string") return item;
    return item?.value ?? item?.name ?? item?.term ?? item?.keyword;
  });
  const strings = values
    .map((value: unknown) => String(value ?? "").trim())
    .filter((value: string) => value.length > 0);
  return [...new Set<string>(strings)];
}
