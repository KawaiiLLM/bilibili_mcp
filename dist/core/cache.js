import QuickLRU from "quick-lru";
import { config } from "./config.js";
export class CacheManager {
    cache = new QuickLRU({ maxSize: config.maxCacheSize });
    get(key) {
        return this.cache.get(key);
    }
    set(key, value, maxAgeMs) {
        this.cache.set(key, value, maxAgeMs === undefined ? undefined : { maxAge: maxAgeMs });
    }
    clear() {
        this.cache.clear();
    }
}
export const cacheManager = new CacheManager();
//# sourceMappingURL=cache.js.map