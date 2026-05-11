import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
import { normalizeAbsoluteUrl } from "../tools/normalize.js";
import type { RequestContext } from "../core/types.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { credentialManager } from "../core/credential.js";
import type { Credential } from "../core/types.js";
import { config } from "../core/config.js";
import { BilibiliAPIError } from "../core/errors.js";
import { describeQuality } from "./quality.js";
import { getPlayUrl } from "./video.js";

const execFileAsync = promisify(execFile);

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
  quality?: number;
  page?: number;
}, ctx?: RequestContext): Promise<any> {
  if (input.timestamp === undefined) {
    return getSnapshotMeta({ bvid: input.bvid, aid: input.aid, cid: input.cid }, ctx);
  }
  return extractFrame({
    bvid: input.bvid,
    cid: input.cid,
    timestamp: input.timestamp,
    quality: input.quality,
    page: input.page,
  });
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

export interface ExtractFrameInput {
  bvid: string;
  cid: number;
  timestamp: number;
  quality?: number;
  page?: number;
}

export interface ExtractFrameResult {
  file: string;
  timestamp: number;
  width?: number;
  height?: number;
  quality: number;
  quality_desc: string | null;
}

export interface FrameRunnerArgs {
  url: string;
  timestamp: number;
  outpath: string;
  headers?: Record<string, string>;
}

export type FrameRunner = (args: FrameRunnerArgs) => Promise<void>;

export interface ExtractFrameOptions {
  runner?: FrameRunner;
}

async function tryGetCredential(): Promise<Credential | undefined> {
  try {
    return await credentialManager.refreshCredentials(false);
  } catch (err) {
    if (err instanceof BilibiliAPIError && err.code === "COOKIECLOUD_CONFIG_INVALID") return undefined;
    if (err instanceof Error && /CookieCloud/.test(err.message)) return undefined;
    throw err;
  }
}

let frameRunner: FrameRunner = defaultFrameRunner;

export function setFrameRunnerForTest(runner: FrameRunner): () => void {
  const previous = frameRunner;
  frameRunner = runner;
  return () => {
    frameRunner = previous;
  };
}

export async function extractFrame(input: ExtractFrameInput, options: ExtractFrameOptions = {}): Promise<ExtractFrameResult> {
  const credential = await tryGetCredential();
  const hasAuth = Boolean(credential?.cookieHeader && /SESSDATA=/.test(credential.cookieHeader));
  const targetQn = input.quality ?? 80;

  const playurl = await getPlayUrl({
    bvid: input.bvid,
    cid: input.cid,
    qn: targetQn,
    tryLook: hasAuth ? undefined : true,
    platform: hasAuth ? undefined : "html5",
    fnval: 16,
    fourk: 1,
  }, hasAuth ? { credential } : undefined);

  const stream = selectVideoStream(playurl, targetQn);
  if (!stream.url) {
    throw new Error("SNAPSHOT_EXTRACT_FAILED: empty stream URL");
  }

  const page = Number.isFinite(input.page) && input.page! > 0 ? input.page : 1;
  const outpath = join(tmpdir(), `bilibili-snapshot-${input.bvid}-p${page}-${Math.floor(input.timestamp)}s.jpg`);

  const headers: Record<string, string> | undefined = hasAuth
    ? { Referer: "https://www.bilibili.com", "User-Agent": config.userAgent }
    : undefined;

  const runner = options.runner ?? frameRunner;
  await runner({ url: stream.url, timestamp: input.timestamp, outpath, headers });

  return {
    file: outpath,
    timestamp: input.timestamp,
    width: stream.width,
    height: stream.height,
    quality: stream.quality,
    quality_desc: describeQuality(stream.quality),
  };
}

async function defaultFrameRunner(args: FrameRunnerArgs): Promise<void> {
  const ffmpegPath = await loadFfmpegPath();
  const cmd: string[] = ["-y", "-ss", String(args.timestamp), "-i", args.url, "-frames:v", "1", "-q:v", "2", args.outpath];
  if (args.headers && Object.keys(args.headers).length > 0) {
    const header = Object.entries(args.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") + "\r\n";
    cmd.splice(0, 0, "-headers", header);
  }
  try {
    await execFileAsync(ffmpegPath, cmd, { timeout: 30_000 });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    const safe = raw.replaceAll(args.url, "<stream-url>");
    throw new Error(`SNAPSHOT_EXTRACT_FAILED: ${safe}`);
  }
}

async function loadFfmpegPath(): Promise<string> {
  const mod: any = await import("ffmpeg-static");
  const path = mod?.default ?? mod;
  if (typeof path !== "string" || path.length === 0) {
    throw new Error("SNAPSHOT_EXTRACT_FAILED: ffmpeg-static binary not available");
  }
  return path;
}
