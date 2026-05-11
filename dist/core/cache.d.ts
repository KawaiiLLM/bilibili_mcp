export declare class CacheManager {
    private cache;
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T, maxAgeMs?: number): void;
    clear(): void;
}
export declare const cacheManager: CacheManager;
