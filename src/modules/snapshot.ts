import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
import { normalizeAbsoluteUrl } from "../tools/normalize.js";
import type { RequestContext } from "../core/types.js";

export interface SnapshotMeta {
  image?: string[];
  index?: number[];
  img_x_len?: number;
  img_y_len?: number;
  img_x_size?: number;
  img_y_size?: number;
  [key: string]: unknown;
}

export interface FrameLocation {
  imageUrl: string;
  frameIndex: number;
  timestamp: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function getSnapshotMeta(input: { bvid?: string; aid?: number; cid?: number }, ctx?: RequestContext): Promise<SnapshotMeta> {
  return request(getEndpoint("video", "info", "get_snapshot"), {
    bvid: input.bvid,
    aid: input.aid,
    cid: input.cid,
  }, ctx);
}

export async function getVideoSnapshot(input: {
  bvid: string;
  aid?: number;
  cid: number;
  timestamp?: number;
}, ctx?: RequestContext): Promise<any> {
  const meta = await getSnapshotMeta({ bvid: input.bvid, aid: input.aid, cid: input.cid }, ctx);
  return input.timestamp === undefined ? meta : { meta, frame: locateFrame(meta, input.timestamp) };
}

export function locateFrame(meta: SnapshotMeta, targetSeconds: number): FrameLocation {
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

function findNearestIndex(index: number[], targetSeconds: number): number {
  const target = Number.isFinite(targetSeconds) ? targetSeconds : 0;
  let left = 0;
  let right = index.length - 1;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (index[middle] < target) left = middle + 1;
    else right = middle;
  }
  if (left === 0) return 0;
  const previous = left - 1;
  return Math.abs(index[previous] - target) <= Math.abs(index[left] - target) ? previous : left;
}

function positiveInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
}

export interface SelectedStream {
  url: string;
  quality: number;
  width?: number;
  height?: number;
  codec?: string;
}

export function selectVideoStream(payload: any, targetQn: number): SelectedStream {
  const dashVideos: any[] = Array.isArray(payload?.dash?.video) ? payload.dash.video : [];
  if (dashVideos.length > 0) {
    const sorted = [...dashVideos].sort((a, b) => {
      const distA = Math.abs(Number(a?.id ?? 0) - targetQn);
      const distB = Math.abs(Number(b?.id ?? 0) - targetQn);
      if (distA !== distB) return distA - distB;
      const codecA = Number(a?.codecid ?? 0);
      const codecB = Number(b?.codecid ?? 0);
      if (codecA === 7 && codecB !== 7) return -1;
      if (codecB === 7 && codecA !== 7) return 1;
      return 0;
    });
    const chosen = sorted[0];
    return {
      url: String(chosen?.baseUrl ?? chosen?.base_url ?? ""),
      quality: Number(chosen?.id ?? 0),
      width: chosen?.width != null ? Number(chosen.width) : undefined,
      height: chosen?.height != null ? Number(chosen.height) : undefined,
      codec: chosen?.codecs ? String(chosen.codecs) : undefined,
    };
  }

  const durl: any[] = Array.isArray(payload?.durl) ? payload.durl : [];
  if (durl.length > 0 && durl[0]?.url) {
    return {
      url: String(durl[0].url),
      quality: Number(payload?.quality ?? 0),
    };
  }

  throw new Error("NO_VIDEO_STREAM");
}
