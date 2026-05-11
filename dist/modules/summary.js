import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
export async function getAiSummary(input, ctx) {
    return request(getEndpoint("video", "info", "get_ai_summary"), {
        bvid: input.bvid,
        cid: input.cid,
        up_mid: input.upMid,
    }, ctx);
}
//# sourceMappingURL=summary.js.map