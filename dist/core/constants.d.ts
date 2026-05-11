declare const BASE_URL_NAMES: readonly ["api", "comment"];
export type BaseUrlName = (typeof BASE_URL_NAMES)[number];
export declare const BASE_URLS: Record<BaseUrlName, string>;
export declare function isBaseUrlName(value: string | undefined): value is BaseUrlName;
export declare const DEFAULT_HEADERS: {
    "User-Agent": string;
    Referer: string;
};
export declare const FORM_CONTENT_TYPE = "application/x-www-form-urlencoded;charset=UTF-8";
export declare const JSON_CONTENT_TYPE = "application/json;charset=UTF-8";
export declare const OPUS_GOBACK_COOKIE = "opus-goback=1";
export declare const DEFAULT_RETRY_OPTIONS: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
};
export {};
