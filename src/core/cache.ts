import QuickLRU from "quick-lru";
import { config } from "./config.js";

export class CacheManager {
  private cache = new QuickLRU<string, unknown>({ maxSize: config.maxCacheSize });

  get<T>(key: string): T | undefined {
    return this.cache.get(key) as T | undefined;
  }

  set<T>(key: string, value: T, maxAgeMs?: number): void {
    this.cache.set(key, value, maxAgeMs === undefined ? undefined : { maxAge: maxAgeMs });
  }

  clear(): void {
    this.cache.clear();
  }
}

export const cacheManager = new CacheManager();
