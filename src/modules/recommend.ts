import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
import type { RequestContext } from "../core/types.js";

export async function getRelatedVideos(input: { bvid: string }, ctx?: RequestContext): Promise<any> {
  return request(getEndpoint("video", "info", "get_related"), { bvid: input.bvid }, ctx);
}
