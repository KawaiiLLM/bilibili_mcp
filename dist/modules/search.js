import { getEndpoint } from "../core/api-loader.js";
import { request } from "../core/client.js";
export async function searchVideos(input, ctx) {
    return request(getEndpoint("search", "search", "web_search_by_type"), {
        search_type: "video",
        keyword: input.keyword,
        page: input.page ?? 1,
        page_size: input.pageSize ?? 10,
    }, ctx);
}
export async function searchAll(input, ctx) {
    return request(getEndpoint("search", "search", "web_search"), {
        keyword: input.keyword,
        page: input.page ?? 1,
    }, ctx);
}
export async function searchByType(input, ctx) {
    if (!input.searchType || input.searchType === "video") {
        return searchVideos({ keyword: input.keyword, page: input.page, pageSize: input.pageSize }, ctx);
    }
    return request(getEndpoint("search", "search", "web_search_by_type"), {
        search_type: input.searchType,
        keyword: input.keyword,
        page: input.page ?? 1,
        page_size: input.pageSize ?? 10,
    }, ctx);
}
export async function getHotSearchKeywords(ctx) {
    const payload = await request(getEndpoint("search", "search", "hotword"), {}, ctx);
    return { list: Array.isArray(payload?.list) ? payload.list : [] };
}
export async function getSearchSuggestions(input, ctx) {
    const payload = await request(getEndpoint("search", "search", "suggest"), { term: input.keyword }, ctx);
    return normalizeSuggestions(payload);
}
function normalizeSuggestions(payload) {
    const candidates = Array.isArray(payload?.result?.tag)
        ? payload.result.tag
        : Array.isArray(payload?.tag)
            ? payload.tag
            : Array.isArray(payload)
                ? payload
                : [];
    const values = candidates.map((item) => {
        if (typeof item === "string")
            return item;
        return item?.value ?? item?.name ?? item?.term ?? item?.keyword;
    });
    const strings = values
        .map((value) => String(value ?? "").trim())
        .filter((value) => value.length > 0);
    return [...new Set(strings)];
}
//# sourceMappingURL=search.js.map