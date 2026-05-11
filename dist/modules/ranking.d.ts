import type { RequestContext } from "../core/types.js";
export declare function getHotVideos(input?: {
    page?: number;
    pageSize?: number;
}, ctx?: RequestContext): Promise<any>;
export declare function getRanking(input?: {
    rid?: number;
    type?: string;
}, ctx?: RequestContext): Promise<any>;
export declare function getWeeklySeries(ctx?: RequestContext): Promise<any>;
export declare function getMustWatch(ctx?: RequestContext): Promise<any>;
