import type { RequestContext } from "../core/types.js";
export declare function likeVideo(input: {
    aid: number;
    like?: 1 | 2;
}, ctx?: RequestContext): Promise<any>;
export declare function coinVideo(input: {
    aid: number;
    multiply?: 1 | 2;
    selectLike?: 0 | 1;
}, ctx?: RequestContext): Promise<any>;
export declare function favoriteVideo(input: {
    aid: number;
    addMediaIds?: number[];
    delMediaIds?: number[];
    folderId?: number;
}, ctx?: RequestContext): Promise<any>;
export declare function followUser(input: {
    mid: number;
    act?: 1 | 2;
}, ctx?: RequestContext): Promise<any>;
export declare function chooseDefaultFavoriteFolder(folders: any[]): any | null;
