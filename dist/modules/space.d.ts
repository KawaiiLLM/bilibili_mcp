import type { RequestContext } from "../core/types.js";
export type SpaceOrder = "pubdate" | "click" | "stow";
export interface SpaceVideoMeta {
    id: number;
    title: string;
    intro: string;
}
export interface SpaceVideoItem {
    bvid: string;
    url: string;
    aid: number;
    title: string;
    cover: string;
    duration_text: string;
    description: string;
    publish_time: number;
    stat: {
        view: number;
        danmaku: number;
        comment: number;
    };
    category: {
        tid: number;
        name: string;
    };
    is_union_video: boolean;
    is_live_playback: boolean;
    season_id: number | null;
    meta: SpaceVideoMeta | null;
}
export interface SpaceVideoCategory {
    tid: number;
    name: string;
    count: number;
}
export interface SpaceVideosResult {
    mid: number;
    items: SpaceVideoItem[];
    page: {
        current: number;
        size: number;
        total: number;
    };
    categories: SpaceVideoCategory[];
}
export declare function getSpaceVideos(input: {
    mid: number;
    order?: SpaceOrder;
    keyword?: string;
    page?: number;
    limit?: number;
}, ctx?: RequestContext): Promise<SpaceVideosResult>;
export interface SpaceOfficial {
    verified: boolean;
    type: "personal" | "organization" | null;
    title: string | null;
    desc: string | null;
}
export interface SpaceProfession {
    name: string | null;
    department: string | null;
    title: string | null;
}
export interface SpaceVip {
    active: boolean;
    label: string | null;
    due_date: number | null;
}
export interface SpaceLiveRoom {
    roomid: number;
    is_live: boolean;
    title: string;
    cover: string;
    url: string;
}
export interface SpaceFansMedal {
    name: string;
    level: number;
    target_mid: number | null;
}
export interface SpaceInfoResult {
    mid: number;
    name: string;
    sex: string;
    avatar: string;
    banner: string;
    sign: string;
    level: number;
    is_senior_member: boolean;
    birthday: string;
    school: string | null;
    tags: string[] | null;
    pendant: string | null;
    fans_medal: SpaceFansMedal | null;
    official: SpaceOfficial;
    profession: SpaceProfession | null;
    vip: SpaceVip;
    live_room: SpaceLiveRoom | null;
    sys_notice: string | null;
    is_followed: boolean;
    space_url: string;
}
export declare function getSpaceInfo(input: {
    mid: number;
}, ctx?: RequestContext): Promise<SpaceInfoResult>;
