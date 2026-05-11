interface CachedTicket {
    value: string;
    expireAt: number;
}
declare function hmacSha256(key: string, message: string): string;
export declare const _hmacSha256ForTest: typeof hmacSha256;
export declare function clearTicketCache(): void;
export declare function getBiliTicketCached(): Readonly<CachedTicket> | null;
export interface GetBiliTicketOptions {
    signal?: AbortSignal;
    cookieHeader?: string;
}
export declare function getBiliTicket(opts?: GetBiliTicketOptions): Promise<string | undefined>;
export {};
