export declare const DANMAKU_MODE_LABELS: Record<number, string>;
export declare function stripHtml(value: unknown): string;
export declare function normalizeAbsoluteUrl(url: unknown): string;
export declare function colorIntToHex(value: number): string;
export declare function truncateText(value: unknown, max: number): string;
export type VideoCardSource = "hot" | "ranking" | "weekly" | "must_watch" | "search" | "related";
export interface VideoCard {
    bvid: string;
    aid: number;
    title: string;
    url: string;
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
        like: number;
        coin: number;
        favorite: number;
        reply: number;
        danmaku: number;
        share: number;
    };
    description?: string;
    pub_location?: string;
    category?: string;
    pubdate?: number;
    extras?: Record<string, unknown>;
}
export declare function normalizeVideoCard(raw: any, source: VideoCardSource): VideoCard;
export interface VideoListResult {
    list: VideoCard[];
    page?: number;
    has_more?: boolean;
    total?: number;
}
export interface NormalizeVideoListOptions {
    limit?: number;
    arrayKey?: string;
}
export declare function normalizeVideoList(payload: unknown, source: VideoCardSource, opts?: NormalizeVideoListOptions): VideoListResult;
export interface DanmakuItem {
    time_seconds: number;
    content: string;
    mode: number;
    mode_label: string;
    font_size: number;
    color: number;
    color_hex: string;
}
export declare function normalizeDanmakuItem(raw: any): DanmakuItem;
export interface SubtitleEntry {
    id: number;
    lan: string;
    lan_doc: string;
    type: number;
    ai_generated: boolean;
    subtitle_url: string;
}
export declare function normalizeSubtitleEntry(raw: any): SubtitleEntry;
