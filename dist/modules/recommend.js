import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
export async function getRelatedVideos(input, ctx) {
    return request(getEndpoint("video", "info", "get_related"), { bvid: input.bvid }, ctx);
}
//# sourceMappingURL=recommend.js.map