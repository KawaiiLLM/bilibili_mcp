import { type VideoPageInfo } from "../modules/video.js";
import { type ToolRouter } from "./common.js";
export interface ResolvedVideoContext {
    videoData: any;
    bvid: string;
    aid: number;
    page: VideoPageInfo;
    pages: VideoPageInfo[];
}
export declare const videoToolRouter: ToolRouter;
export declare function resolveVideoContext(input: string, page?: number): Promise<ResolvedVideoContext>;
export declare function normalizeAiSummaryOutput(payload: unknown): Record<string, unknown>;
