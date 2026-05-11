export declare function addWbi2Params(params: Record<string, string | number>): Record<string, string | number>;
export declare function withWbiSignature(params: Record<string, string | number>, signal?: AbortSignal): Promise<Record<string, string | number>>;
export declare function clearWbiCache(): void;
