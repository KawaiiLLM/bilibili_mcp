import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
import type { RequestContext, RequestParams } from "../core/types.js";

export function buildPaginationStr(cursor?: string): string | undefined {
  return cursor ? JSON.stringify({ offset: cursor }) : undefined;
}

export function parseNextCursor(payload: any): string | null {
  const nextOffset = payload?.cursor?.pagination_reply?.next_offset;
  return typeof nextOffset === "string" && nextOffset.length > 0 ? nextOffset : null;
}

export function normalizeComment(raw: any): any {
  return {
    rpid: raw?.rpid,
    content: String(raw?.content?.message ?? ""),
    author: {
      mid: raw?.member?.mid,
      name: raw?.member?.uname,
      avatar: raw?.member?.avatar ?? raw?.member?.face,
    },
    like: toNumber(raw?.like),
    ctime: toNumber(raw?.ctime),
    reply_count: toNumber(raw?.rcount),
    replies: Array.isArray(raw?.replies) ? raw.replies.map(normalizeComment) : [],
  };
}

export async function getComments(input: {
  oid: number;
  type?: number;
  mode?: 0 | 1 | 2 | 3;
  cursor?: string;
  limit?: number;
}, ctx?: RequestContext): Promise<any> {
  const params: RequestParams = {
    oid: input.oid,
    type: input.type ?? 1,
    mode: input.mode ?? 3,
    ps: input.limit ?? 20,
    pagination_str: buildPaginationStr(input.cursor),
  };
  const payload = await request<any>(getEndpoint("comment", "reply", "main"), params, ctx);
  return {
    comments: normalizeCommentList(payload?.replies),
    cursor: {
      next_cursor: parseNextCursor(payload),
      is_end: Boolean(payload?.cursor?.is_end),
    },
  };
}

export async function getCommentReplies(input: {
  oid: number;
  rpid: number;
  type?: number;
  page?: number;
  limit?: number;
}, ctx?: RequestContext): Promise<any> {
  const payload = await request<any>(getEndpoint("comment", "reply", "replies"), {
    oid: input.oid,
    root: input.rpid,
    type: input.type ?? 1,
    pn: input.page ?? 1,
    ps: input.limit ?? 20,
  }, ctx);
  return {
    replies: normalizeCommentList(payload?.replies),
    page: {
      pn: toNumber(payload?.page?.num, input.page ?? 1),
      ps: toNumber(payload?.page?.size, input.limit ?? 20),
      count: toNumber(payload?.page?.count),
    },
  };
}

function normalizeCommentList(value: unknown): any[] {
  return Array.isArray(value) ? value.map(normalizeComment) : [];
}

function toNumber(value: unknown, fallback = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}
