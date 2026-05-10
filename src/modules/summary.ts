import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
import type { RequestContext } from "../core/types.js";

export async function getAiSummary(input: { bvid: string; cid: number; upMid?: number }, ctx?: RequestContext): Promise<any> {
  return request(getEndpoint("video", "info", "get_ai_summary"), {
    bvid: input.bvid,
    cid: input.cid,
    up_mid: input.upMid,
  }, ctx);
}
