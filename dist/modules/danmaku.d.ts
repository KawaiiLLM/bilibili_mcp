import type { RequestContext } from "../core/types.js";
export declare function parseDanmakuXml(xml: string, limit: number): any;
export declare function getXmlDanmaku(input: {
    cid: number;
    limit?: number;
}, ctx?: RequestContext): Promise<any>;
export declare function getProtoDanmaku(input: {
    oid: number;
    segmentIndex?: number;
    limit?: number;
}, ctx?: RequestContext): Promise<any>;
