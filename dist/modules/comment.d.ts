import type { RequestContext } from "../core/types.js";
export declare function buildPaginationStr(cursor?: string): string | undefined;
export declare function parseNextCursor(payload: any): string | null;
export declare function normalizeComment(raw: any): any;
export declare function getComments(input: {
    oid: number;
    type?: number;
    mode?: 0 | 1 | 2 | 3;
    cursor?: string;
    limit?: number;
}, ctx?: RequestContext): Promise<any>;
export declare function getCommentReplies(input: {
    oid: number;
    rpid: number;
    type?: number;
    page?: number;
    limit?: number;
}, ctx?: RequestContext): Promise<any>;
