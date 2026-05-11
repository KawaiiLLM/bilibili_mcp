import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
import { normalizeAbsoluteUrl } from "../tools/normalize.js";
export async function getSnapshotMeta(input, ctx) {
    return request(getEndpoint("video", "info", "get_snapshot"), {
        bvid: input.bvid,
        aid: input.aid,
        cid: input.cid,
    }, ctx);
}
export async function getVideoSnapshot(input, ctx) {
    const meta = await getSnapshotMeta({ bvid: input.bvid, aid: input.aid, cid: input.cid }, ctx);
    return input.timestamp === undefined ? meta : { meta, frame: locateFrame(meta, input.timestamp) };
}
export function locateFrame(meta, targetSeconds) {
    const image = Array.isArray(meta.image) ? meta.image : [];
    const index = Array.isArray(meta.index) ? meta.index.map(Number).filter(Number.isFinite) : [];
    const columns = positiveInteger(meta.img_x_len, 10);
    const rows = positiveInteger(meta.img_y_len, 10);
    const width = positiveInteger(meta.img_x_size, 160);
    const height = positiveInteger(meta.img_y_size, 90);
    if (image.length === 0 || index.length === 0) {
        throw new Error("视频快照缺少 image 或 index 数据。");
    }
    const frameIndex = findNearestIndex(index, targetSeconds);
    const framesPerImage = columns * rows;
    const imageIndex = Math.min(image.length - 1, Math.floor(frameIndex / framesPerImage));
    const offset = frameIndex % framesPerImage;
    return {
        imageUrl: normalizeAbsoluteUrl(image[imageIndex]),
        frameIndex,
        timestamp: index[frameIndex],
        x: (offset % columns) * width,
        y: Math.floor(offset / columns) * height,
        width,
        height,
    };
}
function findNearestIndex(index, targetSeconds) {
    const target = Number.isFinite(targetSeconds) ? targetSeconds : 0;
    let left = 0;
    let right = index.length - 1;
    while (left < right) {
        const middle = Math.floor((left + right) / 2);
        if (index[middle] < target)
            left = middle + 1;
        else
            right = middle;
    }
    if (left === 0)
        return 0;
    const previous = left - 1;
    return Math.abs(index[previous] - target) <= Math.abs(index[left] - target) ? previous : left;
}
function positiveInteger(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}
//# sourceMappingURL=snapshot.js.map