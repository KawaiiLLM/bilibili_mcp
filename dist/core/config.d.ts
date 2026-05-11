export interface Config {
    logLevel: "debug" | "info" | "warn" | "error" | "silent";
    rateLimitMs: number;
    requestTimeoutMs: number;
    wbiCacheExpirationMs: number;
    wbiRetryTimes: number;
    maxCacheSize: number;
    baseUrl: string;
    commentBaseUrl: string;
    userAgent: string;
    referer: string;
    cookieCloudEndpoint: string;
    cookieCloudUuid: string;
    cookieCloudPassword: string;
    cookieCloudDomains: string[];
    cookieRefreshIntervalMinutes: number;
    transportMode: "stdio" | "http";
    httpHost: string;
    httpPort: number;
    httpMcpPath: string;
    httpSsePath: string;
    httpMessagesPath: string;
    enableBiliTicket: boolean;
    enableBuvidActivation: boolean;
}
export declare const DEFAULT_CONFIG: Omit<Config, "cookieCloudEndpoint" | "cookieCloudUuid" | "cookieCloudPassword">;
export declare const config: Config;
export declare function validateRuntimeConfig(): void;
