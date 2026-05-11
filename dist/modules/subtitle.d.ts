import type { RequestContext } from "../core/types.js";
export declare function getVideoSubtitles(input: {
    bvid: string;
    cid: number;
    preferredLang?: string;
}, ctx?: RequestContext): Promise<any>;
export declare function selectBestSubtitle(subtitles: any[], preferredLang?: string): any | undefined;
export declare function normalizeSubtitleUrl(url: unknown): string | undefined;
