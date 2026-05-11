import type { RequestContext } from "../core/types.js";
export declare function searchVideos(input: {
    keyword: string;
    page?: number;
    pageSize?: number;
}, ctx?: RequestContext): Promise<any>;
export declare function searchAll(input: {
    keyword: string;
    page?: number;
}, ctx?: RequestContext): Promise<any>;
export declare function searchByType(input: {
    keyword: string;
    searchType?: string;
    page?: number;
    pageSize?: number;
}, ctx?: RequestContext): Promise<any>;
export declare function getHotSearchKeywords(ctx?: RequestContext): Promise<any>;
export declare function getSearchSuggestions(input: {
    keyword: string;
}, ctx?: RequestContext): Promise<string[]>;
