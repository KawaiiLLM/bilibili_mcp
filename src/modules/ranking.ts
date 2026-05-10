import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
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
