import { ValidationError } from "../core/errors.js";
import { getHotSearchKeywords, getSearchSuggestions, searchAll, searchByType } from "../modules/search.js";
import { getHotVideos, getMustWatch, getRanking, getWeeklySeries } from "../modules/ranking.js";
import { getRelatedVideos } from "../modules/recommend.js";
import { formatDuration } from "../modules/video.js";
import { stripHtml } from "../modules/search.js";
import { assertAllowedArgs, optionalNumber, optionalString, positiveInteger, requireString, type ToolRouter } from "./common.js";
import { resolveVideoContext } from "./video-tool.js";

const TOOL_NAME = "bilibili_discovery";
const DISCOVERY_ACTIONS = ["search", "search_type", "suggest", "hot", "ranking", "weekly", "must_watch", "related"] as const;
type DiscoveryAction = (typeof DISCOVERY_ACTIONS)[number];

export const discoveryToolRouter: ToolRouter = {
  definition: {
    name: TOOL_NAME,
    description: "B 站发现工具。支持搜索、建议、热门、排行榜、每周必看、入站必刷和相关推荐。",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: DISCOVERY_ACTIONS },
        keyword: { type: "string", description: "搜索关键词" },
        search_type: { type: "string", description: "分类搜索类型，默认 video" },
        page: { type: "number", description: "页码，默认 1" },
        limit: { type: "number", description: "返回数量，默认 10 或 20" },
        rid: { type: "number", description: "排行榜分区 id" },
        type: { type: "string", description: "排行榜类型，默认 all" },
        input: { type: "string", description: "related 使用的视频输入" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  async call(args: Record<string, unknown>): Promise<unknown> {
    assertAllowedArgs(TOOL_NAME, args, ["action", "keyword", "search_type", "page", "limit", "rid", "type", "input"]);
    const action = requireDiscoveryAction(args);
    const page = positiveInteger(optionalNumber(TOOL_NAME, args, "page"), 1, "page", TOOL_NAME);
    const limit = positiveInteger(optionalNumber(TOOL_NAME, args, "limit"), action === "hot" ? 20 : 10, "limit", TOOL_NAME);
    switch (action) {
      case "search":
        return searchAll({ keyword: requireString(TOOL_NAME, args, "keyword"), page });
      case "search_type":
        return searchByType({
          keyword: requireString(TOOL_NAME, args, "keyword"),
          searchType: optionalString(args.search_type) ?? "video",
          page,
          pageSize: limit,
        });
      case "suggest":
        return getSearchSuggestions({ keyword: requireString(TOOL_NAME, args, "keyword") });
      case "hot":
        return getHotVideos({ page, pageSize: limit });
      case "ranking":
        return getRanking({ rid: optionalNumber(TOOL_NAME, args, "rid"), type: optionalString(args.type) });
      case "weekly":
        return getWeeklySeries();
      case "must_watch":
        return getMustWatch();
      case "related": {
        const context = await resolveVideoContext(requireString(TOOL_NAME, args, "input"), 1);
        return {
          bvid: context.bvid,
          aid: context.aid,
          related: normalizeRelatedVideos(await getRelatedVideos({ bvid: context.bvid }), limit),
        };
      }
    }
  },
};

function requireDiscoveryAction(args: Record<string, unknown>): DiscoveryAction {
  const action = requireString(TOOL_NAME, args, "action");
  if (isDiscoveryAction(action)) return action;
  throw new ValidationError("action 不受支持。", { tool: TOOL_NAME, action, fieldErrors: [{ field: "action", message: "不支持的发现 action。", received: action, allowed_values: [...DISCOVERY_ACTIONS] }] });
}

function isDiscoveryAction(action: string): action is DiscoveryAction {
  return DISCOVERY_ACTIONS.some((candidate) => candidate === action);
}

function normalizeRelatedVideos(payload: unknown, limit: number): Array<Record<string, unknown>> {
  const items = Array.isArray(payload) ? payload : [];
  return items.slice(0, limit).map((item) => {
    const video = toRecord(item);
    const bvid = optionalString(video.bvid);
    const aid = toNullableNumber(video.aid);
    const cid = toNullableNumber(video.cid);
    const duration = toNullableNumber(video.duration) ?? 0;

    return {
      title: stripHtml(optionalString(video.title)),
      bvid: bvid ?? null,
      aid,
      cid,
      url: bvid ? `https://www.bilibili.com/video/${bvid}` : aid ? `https://www.bilibili.com/video/av${aid}` : null,
      cover: optionalString(video.pic) ?? null,
      owner: normalizeOwner(video.owner),
      stat: normalizeStat(video.stat),
      duration_seconds: duration,
      duration_text: formatDuration(duration),
      description: stripHtml(optionalString(video.desc)),
      category: optionalString(video.tname) ?? null,
    };
  });
}

function normalizeOwner(value: unknown): Record<string, unknown> {
  const owner = toRecord(value);
  return {
    mid: toNullableNumber(owner.mid),
    name: optionalString(owner.name) ?? null,
    avatar: optionalString(owner.face) ?? null,
  };
}

function normalizeStat(value: unknown): Record<string, number> {
  const stat = toRecord(value);
  return {
    view: toNumber(stat.view),
    danmaku: toNumber(stat.danmaku),
    reply: toNumber(stat.reply),
    favorite: toNumber(stat.favorite),
    coin: toNumber(stat.coin),
    share: toNumber(stat.share),
    like: toNumber(stat.like),
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function toNullableNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toNumber(value: unknown): number {
  return toNullableNumber(value) ?? 0;
}
