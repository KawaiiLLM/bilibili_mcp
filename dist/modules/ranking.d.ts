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
export interface HomeRecommendItem {
    bvid: string;
    url: string;
    aid: number;
    cid: number;
    title: string;
    cover: string;
    duration_seconds: number;
    duration_text: string;
    owner: {
        mid: number;
        name: string;
        avatar: string;
    };
    stat: {
        view: number;
        danmaku: number;
        like: number;
    };
    publish_time: number;
    is_followed: boolean;
    reason: string | null;
}
export interface HomeRecommendResult {
    items: HomeRecommendItem[];
}
export declare function getHomeRecommend(input?: {
    limit?: number;
}, ctx?: RequestContext): Promise<HomeRecommendResult>;
