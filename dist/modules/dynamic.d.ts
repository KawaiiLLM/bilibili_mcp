import type { RequestContext } from "../core/types.js";
export interface FollowingVideoItem {
    bvid: string;
    aid: number;
    title: string;
    cover: string;
    duration_text: string;
    desc: string;
    jump_url: string;
    stat: {
        view: number;
        danmaku: number;
    };
    publish_time: number;
    publish_text: string;
    author: {
        mid: number;
        name: string;
        avatar: string;
    };
    dynamic_id: string;
}
export interface FollowingVideosResult {
    items: FollowingVideoItem[];
    cursor: string | null;
    has_more: boolean;
    update_baseline: string | null;
}
export declare function getFollowingVideos(input?: {
    cursor?: string;
    limit?: number;
}, ctx?: RequestContext): Promise<FollowingVideosResult>;
