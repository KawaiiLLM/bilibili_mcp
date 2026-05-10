import { BilibiliAPIError, ValidationError } from "../core/errors.js";
import { extractAid, extractBVId, resolveBilibiliVideoInput } from "../core/bvid.js";
import { searchVideos } from "../modules/search.js";
import { getAiSummary } from "../modules/summary.js";
import { getVideoSnapshot } from "../modules/snapshot.js";
import { getVideoSubtitles } from "../modules/subtitle.js";
import { formatDuration, getPlayUrl, getVideoDetail, getVideoInfo, normalizePages, selectPage, type VideoPageInfo } from "../modules/video.js";
import { assertAllowedArgs, optionalNumber, optionalString, requireString, type ToolRouter } from "./common.js";

const TOOL_NAME = "bilibili_video";
const VIDEO_ACTIONS = ["info", "detail", "subtitle", "summary", "snapshot", "stream", "pages"] as const;
type VideoAction = (typeof VIDEO_ACTIONS)[number];

export interface ResolvedVideoContext {
  videoData: any;
  bvid: string;
  aid: number;
  page: VideoPageInfo;
  pages: VideoPageInfo[];
}

export const videoToolRouter: ToolRouter = {
  definition: {
    name: TOOL_NAME,
    description: "B 站视频工具。通过 action 选择 info/detail/subtitle/summary/snapshot/stream/pages。",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: VIDEO_ACTIONS, description: "info/detail/subtitle/summary/snapshot/stream/pages" },
        input: { type: "string", description: "BV号、AV号、视频链接或关键词" },
        page: { type: "number", description: "分P序号，默认 1" },
        preferred_lang: { type: "string", description: "字幕语言偏好，例如 zh-Hans、en" },
        timestamp: { type: "number", description: "目标时间戳/秒，snapshot 使用" },
        quality: { type: "number", description: "视频清晰度 qn，stream 使用" },
      },
      required: ["action", "input"],
      additionalProperties: false,
    },
  },
  async call(args: Record<string, unknown>): Promise<unknown> {
    assertAllowedArgs(TOOL_NAME, args, ["action", "input", "page", "preferred_lang", "timestamp", "quality"]);
    const action = requireVideoAction(args);
    const page = Math.floor(optionalNumber(TOOL_NAME, args, "page") ?? 1);
    const context = await resolveVideoContext(requireString(TOOL_NAME, args, "input"), page);
    switch (action) {
      case "info":
        return summarizeContext(context);
      case "pages":
        return { bvid: context.bvid, aid: context.aid, pages: summarizePages(context.pages) };
      case "detail":
        return { ...summarizeContext(context), detail: await getVideoDetail({ bvid: context.bvid }) };
      case "subtitle":
        return getVideoSubtitles({ bvid: context.bvid, cid: context.page.cid, preferredLang: optionalString(args.preferred_lang) });
      case "summary":
        return getAiSummary({ bvid: context.bvid, cid: context.page.cid, upMid: toOptionalNumber(context.videoData?.owner?.mid) });
      case "snapshot":
        return getVideoSnapshot({
          bvid: context.bvid,
          aid: context.aid,
          cid: context.page.cid,
          timestamp: optionalNumber(TOOL_NAME, args, "timestamp"),
        });
      case "stream":
        return getPlayUrl({ bvid: context.bvid, cid: context.page.cid, qn: optionalNumber(TOOL_NAME, args, "quality") });
    }
  },
};

export async function resolveVideoContext(input: string, page = 1): Promise<ResolvedVideoContext> {
  const videoData = await resolveVideoData(input);
  const selected = selectPage(videoData, page);
  const bvid = String(videoData?.bvid ?? "");
  const aid = Number(videoData?.aid ?? 0);
  if (!bvid || !Number.isFinite(aid) || aid <= 0) {
    throw new BilibiliAPIError("视频元数据缺少 bvid 或 aid。", "VIDEO_RESOLVE_FAILED", undefined, { input, bvid, aid });
  }
  return { videoData, bvid, aid, page: selected, pages: normalizePages(videoData) };
}

async function resolveVideoData(input: string): Promise<any> {
  const normalized = await resolveBilibiliVideoInput(input);
  try {
    return await getVideoInfo({ bvid: extractBVId(normalized) });
  } catch {
    const aid = tryExtractAid(normalized);
    if (aid) return getVideoInfo({ aid });
  }
  const searchResult = await searchVideos({ keyword: normalized, page: 1, pageSize: 1 });
  const first = Array.isArray(searchResult?.results) ? searchResult.results[0] : undefined;
  if (!first?.bvid) {
    throw new BilibiliAPIError("没有找到匹配的视频。", "VIDEO_NOT_FOUND", undefined, searchResult?.raw);
  }
  return getVideoInfo({ bvid: first.bvid });
}

function summarizeContext(context: ResolvedVideoContext): Record<string, unknown> {
  return {
    title: context.videoData?.title,
    bvid: context.bvid,
    aid: context.aid,
    cid: context.page.cid,
    url: `https://www.bilibili.com/video/${context.bvid}`,
    owner: {
      mid: context.videoData?.owner?.mid,
      name: context.videoData?.owner?.name,
      avatar: context.videoData?.owner?.face,
    },
    stat: context.videoData?.stat,
    duration_seconds: context.videoData?.duration,
    duration_text: formatDuration(Number(context.videoData?.duration)),
    description: context.videoData?.desc ?? "",
    pages: summarizePages(context.pages),
    selected_page: context.page.page,
    selected_cid: context.page.cid,
    selected_part: context.page.part,
  };
}

function summarizePages(pages: VideoPageInfo[]): any[] {
  return pages.map((page) => ({
    page: page.page,
    cid: page.cid,
    part: page.part,
    duration_seconds: page.duration ?? 0,
    duration_text: formatDuration(Number(page.duration ?? 0)),
  }));
}

function requireVideoAction(args: Record<string, unknown>): VideoAction {
  const action = requireString(TOOL_NAME, args, "action");
  if (VIDEO_ACTIONS.includes(action as VideoAction)) return action as VideoAction;
  throw new ValidationError("action 不受支持。", { tool: TOOL_NAME, action, fieldErrors: [{ field: "action", message: "不支持的视频 action。", received: action, allowed_values: [...VIDEO_ACTIONS] }] });
}

function tryExtractAid(input: string): number | undefined {
  try {
    return extractAid(input);
  } catch {
    return undefined;
  }
}

function toOptionalNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : undefined;
}
