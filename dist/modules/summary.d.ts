import type { RequestContext } from "../core/types.js";
export declare function getAiSummary(input: {
    bvid: string;
    cid: number;
    upMid?: number;
}, ctx?: RequestContext): Promise<any>;
