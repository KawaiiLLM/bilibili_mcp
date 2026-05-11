import type { RequestContext } from "../core/types.js";
export interface VideoPageInfo {
    page: number;
    cid: number;
    part: string;
    duration?: number;
}
export declare function getVideoInfo(input: {
    bvid?: string;
    aid?: number;
}, ctx?: RequestContext): Promise<any>;
export declare function getVideoDetail(input: {
    bvid: string;
}, ctx?: RequestContext): Promise<any>;
export declare function getPlayerInfo(input: {
    bvid: string;
    cid: number;
}, ctx?: RequestContext): Promise<any>;
export declare function getPlayUrl(input: {
    bvid: string;
    cid: number;
    qn?: number;
}, ctx?: RequestContext): Promise<any>;
export declare function normalizePages(videoData: any): VideoPageInfo[];
export declare function selectPage(videoData: any, page: number): VideoPageInfo;
export declare function formatDuration(seconds: number): string;
