import type { Credential } from "./types.js";
export interface CookieCloudRuntimeConfig {
    endpoint: string;
    uuid: string;
    password: string;
}
export declare class CredentialManager {
    private credentials;
    private refreshPromise;
    initialize(): Promise<void>;
    configureCookieCloud(runtimeConfig: CookieCloudRuntimeConfig): Promise<string>;
    getStatus(): {
        source: "cookiecloud";
        endpoint: string;
        refreshIntervalMinutes: number;
        refreshedAt: number | null;
        hasCredentials: boolean;
    };
    refreshCredentials(force?: boolean): Promise<Credential>;
    markAuthFailureAndRefresh(): Promise<void>;
    private fetchFromCookieCloud;
}
export declare const credentialManager: CredentialManager;
export declare function getCookieValue(credential: Credential | string | undefined, name: string): string | undefined;
export declare function getBiliJct(credential: Credential | string | undefined): string | undefined;
export declare function getDedeUserId(credential: Credential | string | undefined): string | undefined;
