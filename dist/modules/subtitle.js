import { BilibiliAPIError } from "../core/errors.js";
import { getPlayerInfo } from "./video.js";
import { checkLoginStatus } from "./auth.js";
import { normalizeAbsoluteUrl } from "../tools/normalize.js";
export async function getVideoSubtitles(input, ctx) {
    const player = await getPlayerInfo({ bvid: input.bvid, cid: input.cid }, ctx);
    const subtitles = Array.isArray(player?.subtitle?.subtitles) ? player.subtitle.subtitles : [];
    if (subtitles.length === 0) {
        const login = await checkLoginStatus(ctx);
        if (!login.isLogin) {
            throw new BilibiliAPIError("当前 B 站登录态无效，无法获取字幕。", "BILIBILI_COOKIE_INVALID", undefined, undefined, true, "请确认 CookieCloud 中的 B 站登录态仍然有效，并重新同步 Cookie。");
        }
    }
    const selected = selectBestSubtitle(subtitles, input.preferredLang);
    return {
        bvid: input.bvid,
        cid: input.cid,
        subtitles,
        selected_language: selected?.lan,
        selected_language_label: selected?.lan_doc,
        selected_url: optionalUrl(selected?.subtitle_url),
    };
}
export function selectBestSubtitle(subtitles, preferredLang) {
    if (!Array.isArray(subtitles) || subtitles.length === 0)
        return undefined;
    const langs = [preferredLang, "zh-Hans", "zh-CN", "zh-Hant", "en"].filter(Boolean);
    for (const lang of langs) {
        const exact = subtitles.find((item) => item?.lan === lang);
        if (exact)
            return exact;
        const partial = subtitles.find((item) => String(item?.lan ?? "").includes(lang));
        if (partial)
            return partial;
    }
    return subtitles[0];
}
export function normalizeSubtitleUrl(url) {
    return optionalUrl(url);
}
function optionalUrl(url) {
    const value = normalizeAbsoluteUrl(url);
    return value ? value : undefined;
}
//# sourceMappingURL=subtitle.js.map