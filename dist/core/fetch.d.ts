export declare function fetchWithTimeout(url: URL, init?: RequestInit, timeoutMs?: number): Promise<Response>;
export declare function composeSignals(...signals: Array<AbortSignal | null | undefined>): AbortSignal;
