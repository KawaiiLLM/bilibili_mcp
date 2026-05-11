import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
export function buildPaginationStr(cursor) {
    return cursor ? JSON.stringify({ offset: cursor }) : undefined;
}
export function parseNextCursor(payload) {
    const nextOffset = payload?.cursor?.pagination_reply?.next_offset;
    return typeof nextOffset === "string" && nextOffset.length > 0 ? nextOffset : null;
}
export function normalizeComment(raw) {
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
export async function getComments(input, ctx) {
    const params = {
        oid: input.oid,
        type: input.type ?? 1,
        mode: input.mode ?? 3,
        ps: input.limit ?? 20,
        pagination_str: buildPaginationStr(input.cursor),
    };
    const payload = await request(getEndpoint("comment", "reply", "main"), params, ctx);
    return {
        comments: normalizeCommentList(payload?.replies),
        cursor: {
            next_cursor: parseNextCursor(payload),
            is_end: Boolean(payload?.cursor?.is_end),
        },
    };
}
export async function getCommentReplies(input, ctx) {
    const payload = await request(getEndpoint("comment", "reply", "replies"), {
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
function normalizeCommentList(value) {
    return Array.isArray(value) ? value.map(normalizeComment) : [];
}
function toNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}
//# sourceMappingURL=comment.js.map