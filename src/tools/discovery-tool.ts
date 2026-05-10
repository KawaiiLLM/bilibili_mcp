import { ValidationError } from "../core/errors.js";
import { getHotSearchKeywords, getSearchSuggestions, searchAll, searchByType, searchVideos } from "../modules/search.js";
import { getHotVideos, getMustWatch, getRanking, getWeeklySeries } from "../modules/ranking.js";
import { getRelatedVideos } from "../modules/recommend.js";
import { assertAllowedArgs, optionalNumber, optionalString, positiveInteger, requireString, type ToolRouter } from "./common.js";
import { normalizeVideoList } from "./normalize.js";
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
      case "search": {
        const payload = await searchVideos({
          keyword: requireString(TOOL_NAME, args, "keyword"),
          page,
          pageSize: limit,
        });
        return normalizeVideoList(payload, "search", { arrayKey: "result", limit });
      }
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
        return normalizeVideoList(await getHotVideos({ page, pageSize: limit }), "hot", { limit });
      case "ranking":
        return normalizeVideoList(
          await getRanking({ rid: optionalNumber(TOOL_NAME, args, "rid"), type: optionalString(args.type) }),
          "ranking",
          { limit },
        );
      case "weekly":
        return normalizeVideoList(await getWeeklySeries(), "weekly", { limit });
      case "must_watch":
        return normalizeVideoList(await getMustWatch(), "must_watch", { limit });
      case "related": {
        const context = await resolveVideoContext(requireString(TOOL_NAME, args, "input"), 1);
        const payload = await getRelatedVideos({ bvid: context.bvid });
        return {
          bvid: context.bvid,
          aid: context.aid,
          ...normalizeVideoList(payload, "related", { limit }),
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
