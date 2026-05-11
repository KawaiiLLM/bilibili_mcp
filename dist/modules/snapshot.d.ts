import type { RequestContext } from "../core/types.js";
export interface SnapshotMeta {
    image?: string[];
    index?: number[];
    img_x_len?: number;
    img_y_len?: number;
    img_x_size?: number;
    img_y_size?: number;
    [key: string]: unknown;
}
export interface FrameLocation {
    imageUrl: string;
    frameIndex: number;
    timestamp: number;
    x: number;
    y: number;
    width: number;
    height: number;
}
export declare function getSnapshotMeta(input: {
    bvid?: string;
    aid?: number;
    cid?: number;
}, ctx?: RequestContext): Promise<SnapshotMeta>;
export declare function getVideoSnapshot(input: {
    bvid: string;
    aid?: number;
    cid: number;
    timestamp?: number;
    quality?: number;
    page?: number;
}, ctx?: RequestContext): Promise<any>;
export declare function locateFrame(meta: SnapshotMeta, targetSeconds: number): FrameLocation;
export interface SelectedStream {
    url: string;
    quality: number;
    width?: number;
    height?: number;
    codec?: string;
}
export declare function selectVideoStream(payload: any, targetQn: number): SelectedStream;
export interface ExtractFrameInput {
    bvid: string;
    cid: number;
    timestamp: number;
    quality?: number;
    page?: number;
}
export interface ExtractFrameResult {
    file: string;
    timestamp: number;
    width?: number;
    height?: number;
    quality: number;
    quality_desc: string | null;
}
export interface FrameRunnerArgs {
    url: string;
    timestamp: number;
    outpath: string;
    headers?: Record<string, string>;
}
export type FrameRunner = (args: FrameRunnerArgs) => Promise<void>;
export interface ExtractFrameOptions {
    runner?: FrameRunner;
}
export declare function setFrameRunnerForTest(runner: FrameRunner): () => void;
export declare function extractFrame(input: ExtractFrameInput, options?: ExtractFrameOptions): Promise<ExtractFrameResult>;
