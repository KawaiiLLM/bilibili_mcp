import { ValidationError, BilibiliAPIError } from "../core/errors.js";
import { getComments, getCommentReplies } from "../modules/comment.js";
import { getXmlDanmaku } from "../modules/danmaku.js";
import { coinVideo, favoriteVideo, followUser, likeVideo } from "../modules/action.js";
import { assertAllowedArgs, optionalNumber, optionalNumberArray, optionalString, positiveInteger, requireString, type ToolRouter } from "./common.js";
import { createConfirmationStore } from "./confirmation.js";
import { resolveVideoContext } from "./video-tool.js";

const TOOL_NAME = "bilibili_interaction";
const READ_ACTIONS = ["comments", "replies", "danmaku"] as const;
const WRITE_ACTIONS = ["like", "coin", "favorite", "follow"] as const;
const INTERACTION_ACTIONS = [...READ_ACTIONS, ...WRITE_ACTIONS] as const;
type InteractionAction = (typeof INTERACTION_ACTIONS)[number];
type WriteAction = (typeof WRITE_ACTIONS)[number];

const confirmationStore = createConfirmationStore();

export const interactionToolRouter: ToolRouter = {
  definition: {
    name: TOOL_NAME,
    description: "B 站互动工具。读评论/回复/弹幕；写点赞/投币/收藏/关注需要二次确认。",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: INTERACTION_ACTIONS },
        input: { type: "string", description: "视频 BV/AV/链接/关键词" },
        page: { type: "number", description: "danmaku 分P或 replies 页码，默认 1" },
        rpid: { type: "number", description: "replies 根评论 rpid" },
        cursor: { type: "string", description: "comments 分页游标" },
        mode: { type: "number", description: "comments 排序，0/3=热度，1=热度+时间，2=时间" },
        limit: { type: "number", description: "返回数量限制" },
        confirmation_token: { type: "string", description: "写操作确认 token" },
        aid: { type: "number", description: "视频 aid，可替代 input 用于写操作" },
        mid: { type: "number", description: "用户 mid，follow 必填" },
        like: { type: "number", description: "1 点赞，2 取消点赞" },
        multiply: { type: "number", description: "投币数量 1 或 2" },
        select_like: { type: "number", description: "投币是否同时点赞，0 或 1" },
        folder_id: { type: "number", description: "收藏夹 id" },
        add_media_ids: { type: "array", items: { type: "number" } },
        del_media_ids: { type: "array", items: { type: "number" } },
        act: { type: "number", description: "1 关注，2 取消关注" },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  async call(args: Record<string, unknown>): Promise<unknown> {
    assertAllowedArgs(TOOL_NAME, args, ["action", "input", "page", "rpid", "cursor", "mode", "limit", "confirmation_token", "aid", "mid", "like", "multiply", "select_like", "folder_id", "add_media_ids", "del_media_ids", "act"]);
    const action = requireInteractionAction(args);
    switch (action) {
      case "comments":
        return getCommentList(args);
      case "replies":
        return getReplies(args);
      case "danmaku":
        return getDanmaku(args);
      case "like":
      case "coin":
      case "favorite":
      case "follow":
        return handleWriteAction(action, args);
    }
  },
};

async function getCommentList(args: Record<string, unknown>): Promise<unknown> {
  const target = await resolveVideoTarget(args, false);
  return getComments({
    oid: target.aid,
    type: 1,
    mode: coerceMode(optionalNumber(TOOL_NAME, args, "mode")),
    cursor: optionalString(args.cursor),
    limit: positiveInteger(optionalNumber(TOOL_NAME, args, "limit"), 20, "limit", TOOL_NAME),
  });
}

async function getReplies(args: Record<string, unknown>): Promise<unknown> {
  const target = await resolveVideoTarget(args, false);
  const rpid = Math.floor(optionalNumber(TOOL_NAME, args, "rpid") ?? 0);
  if (rpid <= 0) throw new ValidationError("replies action 需要 rpid。", { tool: TOOL_NAME });
  return getCommentReplies({
    oid: target.aid,
    rpid,
    type: 1,
    page: positiveInteger(optionalNumber(TOOL_NAME, args, "page"), 1, "page", TOOL_NAME),
    limit: positiveInteger(optionalNumber(TOOL_NAME, args, "limit"), 20, "limit", TOOL_NAME),
  });
}

async function getDanmaku(args: Record<string, unknown>): Promise<unknown> {
  const target = await resolveVideoTarget(args, false, positiveInteger(optionalNumber(TOOL_NAME, args, "page"), 1, "page", TOOL_NAME));
  if (!target.cid) throw new ValidationError("danmaku action 未解析到 cid。", { tool: TOOL_NAME });
  return getXmlDanmaku({
    cid: target.cid,
    limit: positiveInteger(optionalNumber(TOOL_NAME, args, "limit"), 100, "limit", TOOL_NAME),
  });
}

async function handleWriteAction(action: WriteAction, args: Record<string, unknown>): Promise<unknown> {
  const plan = await buildWritePlan(action, args);
  const token = optionalString(args.confirmation_token);
  const storeAction = `${TOOL_NAME}.${action}`;
  if (!token) {
    return {
      pending: true,
      action,
      target: plan.target,
      description: plan.description,
      confirmation_token: confirmationStore.create(storeAction, plan.params),
      expires_in_seconds: confirmationStore.ttlSeconds,
      confirm_hint: "请确认后携带 confirmation_token 重新调用。",
    };
  }
  const consumed = confirmationStore.consume(token, storeAction, plan.params);
  if (!consumed.ok) {
    throw new BilibiliAPIError("confirmation_token 无效，写操作未执行。", "CONFIRMATION_INVALID", undefined, consumed, false, "请重新申请确认 token。");
  }
  return { pending: false, action, target: plan.target, result: await plan.execute() };
}

async function buildWritePlan(action: WriteAction, args: Record<string, unknown>): Promise<{
  params: Record<string, unknown>;
  target: Record<string, unknown>;
  description: string;
  execute(): Promise<unknown>;
}> {
  if (action === "follow") {
    const mid = Math.floor(optionalNumber(TOOL_NAME, args, "mid") ?? 0);
    if (mid <= 0) throw new ValidationError("follow action 需要 mid。", { tool: TOOL_NAME });
    const act = coerceChoice(optionalNumber(TOOL_NAME, args, "act") ?? 1, [1, 2], "act") as 1 | 2;
    return { params: { mid, act }, target: { mid }, description: act === 1 ? `关注用户 ${mid}` : `取消关注用户 ${mid}`, execute: () => followUser({ mid, act }) };
  }

  const target = await resolveVideoTarget(args, true);
  if (action === "like") {
    const like = coerceChoice(optionalNumber(TOOL_NAME, args, "like") ?? 1, [1, 2], "like") as 1 | 2;
    return { params: { aid: target.aid, like }, target, description: like === 1 ? `点赞视频 ${target.bvid ?? target.aid}` : `取消点赞视频 ${target.bvid ?? target.aid}`, execute: () => likeVideo({ aid: target.aid, like }) };
  }
  if (action === "coin") {
    const multiply = coerceChoice(optionalNumber(TOOL_NAME, args, "multiply") ?? 1, [1, 2], "multiply") as 1 | 2;
    const selectLike = optionalNumber(TOOL_NAME, args, "select_like");
    const params = { aid: target.aid, multiply, selectLike: selectLike === undefined ? undefined : coerceChoice(selectLike, [0, 1], "select_like") };
    return { params, target, description: `给视频 ${target.bvid ?? target.aid} 投 ${multiply} 个硬币`, execute: () => coinVideo(params as { aid: number; multiply: 1 | 2; selectLike?: 0 | 1 }) };
  }
  const params = {
    aid: target.aid,
    folderId: optionalNumber(TOOL_NAME, args, "folder_id"),
    addMediaIds: optionalNumberArray(args.add_media_ids, "add_media_ids", TOOL_NAME),
    delMediaIds: optionalNumberArray(args.del_media_ids, "del_media_ids", TOOL_NAME),
  };
  return { params, target, description: `调整视频 ${target.bvid ?? target.aid} 的收藏关系`, execute: () => favoriteVideo(params) };
}

async function resolveVideoTarget(args: Record<string, unknown>, allowAid: boolean, page = 1): Promise<{ aid: number; bvid?: string; cid?: number; page?: number }> {
  const aid = optionalNumber(TOOL_NAME, args, "aid");
  if (allowAid && aid && aid > 0) return { aid: Math.floor(aid) };
  const context = await resolveVideoContext(requireString(TOOL_NAME, args, "input"), page);
  return { aid: context.aid, bvid: context.bvid, cid: context.page.cid, page: context.page.page };
}

function requireInteractionAction(args: Record<string, unknown>): InteractionAction {
  const action = requireString(TOOL_NAME, args, "action");
  if (INTERACTION_ACTIONS.includes(action as InteractionAction)) return action as InteractionAction;
  throw new ValidationError("action 不受支持。", { tool: TOOL_NAME, action, fieldErrors: [{ field: "action", message: "不支持的互动 action。", received: action, allowed_values: [...INTERACTION_ACTIONS] }] });
}

function coerceMode(value: number | undefined): 0 | 1 | 2 | 3 {
  return coerceChoice(value ?? 3, [0, 1, 2, 3], "mode") as 0 | 1 | 2 | 3;
}

function coerceChoice(value: number, allowed: number[], field: string): number {
  const numeric = Math.floor(value);
  if (allowed.includes(numeric)) return numeric;
  throw new ValidationError(`${field} 不在允许范围。`, { tool: TOOL_NAME });
}
