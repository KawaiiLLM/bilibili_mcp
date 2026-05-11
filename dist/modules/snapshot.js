import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
import { normalizeAbsoluteUrl } from "../tools/normalize.js";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import { credentialManager } from "../core/credential.js";
import { config } from "../core/config.js";
import { BilibiliAPIError } from "../core/errors.js";
import { describeQuality } from "./quality.js";
import { getPlayUrl } from "./video.js";
const execFileAsync = promisify(execFile);
export async function getSnapshotMeta(input, ctx) {
    return request(getEndpoint("video", "info", "get_snapshot"), {
        bvid: input.bvid,
        aid: input.aid,
        cid: input.cid,
    }, ctx);
}
export async function getVideoSnapshot(input, ctx) {
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
export function selectVideoStream(payload, targetQn) {
    const dashVideos = Array.isArray(payload?.dash?.video) ? payload.dash.video : [];
    if (dashVideos.length > 0) {
        const sorted = [...dashVideos].sort((a, b) => {
            const distA = Math.abs(Number(a?.id ?? 0) - targetQn);
            const distB = Math.abs(Number(b?.id ?? 0) - targetQn);
            if (distA !== distB)
                return distA - distB;
            const codecA = Number(a?.codecid ?? 0);
            const codecB = Number(b?.codecid ?? 0);
            if (codecA === 7 && codecB !== 7)
                return -1;
            if (codecB === 7 && codecA !== 7)
                return 1;
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
    const durl = Array.isArray(payload?.durl) ? payload.durl : [];
    if (durl.length > 0 && durl[0]?.url) {
        return {
            url: String(durl[0].url),
            quality: Number(payload?.quality ?? 0),
        };
    }
    throw new Error("NO_VIDEO_STREAM");
}
async function tryGetCredential() {
    try {
        return await credentialManager.refreshCredentials(false);
    }
    catch (err) {
        if (err instanceof BilibiliAPIError && err.code === "COOKIECLOUD_CONFIG_INVALID")
            return undefined;
        if (err instanceof Error && /CookieCloud/.test(err.message))
            return undefined;
        throw err;
    }
}
let frameRunner = defaultFrameRunner;
export function setFrameRunnerForTest(runner) {
    const previous = frameRunner;
    frameRunner = runner;
    return () => {
        frameRunner = previous;
    };
}
export async function extractFrame(input, options = {}) {
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
    const page = Number.isFinite(input.page) && input.page > 0 ? input.page : 1;
    const outpath = join(tmpdir(), `bilibili-snapshot-${input.bvid}-p${page}-${Math.floor(input.timestamp)}s.jpg`);
    const headers = hasAuth
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
async function defaultFrameRunner(args) {
    const ffmpegPath = await loadFfmpegPath();
    const cmd = ["-y", "-ss", String(args.timestamp), "-i", args.url, "-frames:v", "1", "-q:v", "2", args.outpath];
    if (args.headers && Object.keys(args.headers).length > 0) {
        const header = Object.entries(args.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") + "\r\n";
        cmd.splice(0, 0, "-headers", header);
    }
    try {
        await execFileAsync(ffmpegPath, cmd, { timeout: 30_000 });
    }
    catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        const safe = raw.replaceAll(args.url, "<stream-url>");
        throw new Error(`SNAPSHOT_EXTRACT_FAILED: ${safe}`);
    }
}
async function loadFfmpegPath() {
    const mod = await import("ffmpeg-static");
    const path = mod?.default ?? mod;
    if (typeof path !== "string" || path.length === 0) {
        throw new Error("SNAPSHOT_EXTRACT_FAILED: ffmpeg-static binary not available");
    }
    await ensureFfmpegBinary(path, () => runFfmpegStaticInstaller(path));
    return path;
}
let installPromise = null;
export async function ensureFfmpegBinary(binPath, install) {
    if (await fileExists(binPath))
        return;
    if (!installPromise) {
        installPromise = install().finally(() => { installPromise = null; });
    }
    await installPromise;
    if (!(await fileExists(binPath))) {
        throw new Error("SNAPSHOT_EXTRACT_FAILED: ffmpeg-static binary missing after install");
    }
}
async function fileExists(path) {
    try {
        await access(path);
        return true;
    }
    catch {
        return false;
    }
}
async function runFfmpegStaticInstaller(binPath) {
    const installerPath = join(dirname(binPath), "install.js");
    await execFileAsync(process.execPath, [installerPath], {
        cwd: dirname(binPath),
        timeout: 120_000,
        maxBuffer: 16 * 1024 * 1024,
    });
}
//# sourceMappingURL=snapshot.js.map