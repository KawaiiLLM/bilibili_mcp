export declare function getBuvidCookies(signal?: AbortSignal): Promise<string | undefined>;
export declare function appendBuvidCookies(cookieHeader: string | undefined, buvid: string): string;
export declare function clearBuvidCache(): void;
export declare function _awaitBuvidActivationForTest(): Promise<void>;
